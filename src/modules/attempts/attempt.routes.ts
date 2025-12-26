import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createAttempt } from './attempt.model.js';
import type { AttemptRepository } from './attempt.repository.js';
import type { AssessmentRepository } from '../assessments/assessment.repository.js';
import type { ItemRepository } from '../items/item.repository.js';
import type { CohortRepository } from '../cohorts/cohort.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type {
  AttemptResponse,
  FillBlankMatcher,
  HotspotPoint,
  ScenarioAttachment,
  ScenarioEvaluationConfig,
  ScenarioScoringRule,
  ScenarioWorkspaceTemplate,
} from '../../common/types.js';
import {
  scoreDragDropItem,
  scoreFillBlankItem,
  scoreHotspotItem,
  scoreMatchingItem,
  scoreMcqItem,
  scoreNumericEntryItem,
  scoreOrderingItem,
  scoreTrueFalseItem,
} from '../scoring/scoring.service.js';
import { eventBus } from '../../common/event-bus.js';
import { toJsonSchema } from '../../common/zod-json-schema.js';
import { passThroughValidator } from '../../common/fastify-schema.js';

const startSchema = z.object({ assessmentId: z.string().min(1), userId: z.string().min(1) });
const responseSchema = z.object({
  itemId: z.string(),
  answerIndex: z.number().int().nonnegative().optional(),
  answerIndexes: z.array(z.number().int().nonnegative()).optional(),
  textAnswer: z.string().optional(),
  textAnswers: z.array(z.string()).optional(),
  matchingAnswers: z.array(z.object({ promptId: z.string(), targetId: z.string() })).optional(),
  orderingAnswer: z.array(z.string()).optional(),
  essayAnswer: z.string().optional(),
  numericAnswer: z.object({ value: z.number(), unit: z.string().min(1).max(40).optional() }).optional(),
  hotspotAnswers: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).optional(),
  dragDropAnswers: z
    .array(z.object({ tokenId: z.string().min(1), dropZoneId: z.string().min(1), position: z.number().int().optional() }))
    .optional(),
  scenarioAnswer: z
    .object({
      repositoryUrl: z.string().url().optional(),
      artifactUrl: z.string().url().optional(),
      submissionNotes: z.string().max(4000).optional(),
      files: z.array(z.object({ path: z.string().min(1), url: z.string().url().optional() })).max(50).optional(),
    })
    .optional(),
});

const responsesSchema = z.object({ responses: z.array(responseSchema) });
const startBodySchema = toJsonSchema(startSchema);
const responsesBodySchema = toJsonSchema(responsesSchema);

function ensureAttemptAccess(request: any, reply: FastifyReply): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export interface AttemptRoutesOptions {
  attemptRepository: AttemptRepository;
  assessmentRepository: AssessmentRepository;
  itemRepository: ItemRepository;
  cohortRepository: CohortRepository;
  userRepository: UserRepository;
}

function normalizeTextAnswers(textAnswer?: string, textAnswers?: string[]): string[] | undefined {
  if (textAnswers && textAnswers.length > 0) {
    const normalized = textAnswers.map(value => value?.trim() ?? '');
    return normalized.some(value => value.length > 0) ? normalized : undefined;
  }
  if (typeof textAnswer === 'string') {
    const trimmed = textAnswer.trim();
    return trimmed.length > 0 ? [trimmed] : undefined;
  }
  return undefined;
}

export async function attemptRoutes(app: FastifyInstance, options: AttemptRoutesOptions) {
  const { attemptRepository, assessmentRepository, itemRepository, cohortRepository, userRepository } = options;
  app.post('/', { schema: { body: startBodySchema }, attachValidation: true, validatorCompiler: passThroughValidator }, async (req, reply) => {
    if (!ensureAttemptAccess(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const parsed = startSchema.parse(req.body);
    const assessment = assessmentRepository.getById(tenantId, parsed.assessmentId);
    if (!assessment) { reply.code(400); return { error: 'Invalid assessmentId' }; }
    const learner = userRepository.getById(tenantId, parsed.userId);
    if (!learner) {
      reply.code(400);
      return { error: 'Learner does not exist' };
    }
    if (!learner.roles.includes('LEARNER')) {
      reply.code(400);
      return { error: 'User is not a learner' };
    }
    const cohorts = cohortRepository.listByLearner(tenantId, learner.id);
    const cohortWithAssessment = cohorts.find(cohort => cohort.assessmentIds.includes(assessment.id));
    if (!cohortWithAssessment) {
      reply.code(403);
      return { error: 'Learner is not assigned to this assessment' };
    }

    const assignment = cohortWithAssessment.assignments?.find(a => a.assessmentId === assessment.id);
    const learnerAttempts = attemptRepository.listByLearner(tenantId, assessment.id, learner.id);
    const allowedAttempts = assignment?.allowedAttempts ?? assessment.allowedAttempts ?? 1;

    if (learnerAttempts.length >= Math.max(1, allowedAttempts)) {
      reply.code(409);
      return { error: 'Attempt limit reached' };
    }
    const id = uuid();
    const attempt = createAttempt({ id, tenantId, assessmentId: assessment.id, userId: learner.id });
    attemptRepository.save(attempt);
    eventBus.publish({ id: uuid(), type: 'AttemptStarted', occurredAt: new Date().toISOString(), tenantId, payload: { attemptId: id } });
    reply.code(201);
    return attempt;
  });

  app.patch('/:id/responses', { schema: { body: responsesBodySchema }, attachValidation: true, validatorCompiler: passThroughValidator }, async (req, reply) => {
    if (!ensureAttemptAccess(req, reply)) return;
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const attempt = attemptRepository.getById(tenantId, id);
    if (!attempt) { reply.code(404); return { error: 'Not found' }; }
    if (attempt.status !== 'in_progress') { reply.code(400); return { error: 'Attempt not editable' }; }
    const parsed = responsesSchema.parse(req.body);
    const normalized = parsed.responses.map(r => {
      let answerIndexes: number[] | undefined;
      if (r.answerIndexes && r.answerIndexes.length > 0) {
        answerIndexes = Array.from(new Set(r.answerIndexes));
      } else if (typeof r.answerIndex === 'number') {
        answerIndexes = [r.answerIndex];
      }
      const textAnswers = normalizeTextAnswers(r.textAnswer, r.textAnswers);
      const matchingAnswers = r.matchingAnswers && r.matchingAnswers.length > 0
        ? r.matchingAnswers.map(answer => ({ promptId: answer.promptId, targetId: answer.targetId }))
        : undefined;
      const orderingAnswer = r.orderingAnswer && r.orderingAnswer.length > 0
        ? Array.from(new Set(r.orderingAnswer.map(value => value?.trim()).filter((value): value is string => Boolean(value))))
        : undefined;
      const essayAnswer = typeof r.essayAnswer === 'string' ? r.essayAnswer.trim() : undefined;
      const numericAnswer = typeof r.numericAnswer?.value === 'number' && Number.isFinite(r.numericAnswer.value)
        ? { value: r.numericAnswer.value, unit: r.numericAnswer.unit?.trim() || undefined }
        : undefined;
      let hotspotAnswers = r.hotspotAnswers && r.hotspotAnswers.length > 0
        ? r.hotspotAnswers
            .map(point => ({ x: Number(point.x), y: Number(point.y) }))
            .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
            .map(point => ({
              x: Number(Math.min(1, Math.max(0, point.x)).toFixed(6)),
              y: Number(Math.min(1, Math.max(0, point.y)).toFixed(6)),
            }))
        : undefined;
      if (hotspotAnswers && hotspotAnswers.length === 0) {
        hotspotAnswers = undefined;
      }
      type DragDropPlacement = { tokenId: string; dropZoneId: string; position?: number };
      let dragDropAnswers: DragDropPlacement[] | undefined;
      if (r.dragDropAnswers && r.dragDropAnswers.length > 0) {
        const normalized = r.dragDropAnswers
          .map(answer => ({
            tokenId: answer.tokenId?.trim(),
            dropZoneId: answer.dropZoneId?.trim(),
            position: typeof answer.position === 'number' && Number.isFinite(answer.position)
              ? Math.max(0, Math.floor(answer.position))
              : undefined,
          }))
          .filter(answer => Boolean(answer.tokenId) && Boolean(answer.dropZoneId))
          .map(answer => ({
            tokenId: answer.tokenId as string,
            dropZoneId: answer.dropZoneId as string,
            position: answer.position,
          })) satisfies DragDropPlacement[];
        if (normalized.length > 0) {
          const latestPlacementByToken = new Map<string, DragDropPlacement>();
          for (const placement of normalized) {
            latestPlacementByToken.set(placement.tokenId, placement);
          }
          dragDropAnswers = Array.from(latestPlacementByToken.values());
        }
      }
      if (dragDropAnswers && dragDropAnswers.length > 0) {
        const latestPlacementByToken = new Map<string, { tokenId: string; dropZoneId: string; position?: number }>();
        for (const placement of dragDropAnswers) {
          latestPlacementByToken.set(placement.tokenId, placement);
        }
        dragDropAnswers = Array.from(latestPlacementByToken.values());
      } else {
        dragDropAnswers = undefined;
      }
      let scenarioAnswer: AttemptResponse['scenarioAnswer'] | undefined;
      if (r.scenarioAnswer) {
        const submissionNotes = r.scenarioAnswer.submissionNotes?.trim();
        let files = r.scenarioAnswer.files
          ?.map(file => ({
            path: file.path.trim(),
            url: file.url?.trim(),
          }))
          .filter(file => file.path.length > 0);
        if (files && files.length === 0) {
          files = undefined;
        }
        scenarioAnswer = {
          repositoryUrl: r.scenarioAnswer.repositoryUrl?.trim(),
          artifactUrl: r.scenarioAnswer.artifactUrl?.trim(),
          submissionNotes: submissionNotes && submissionNotes.length > 0 ? submissionNotes : undefined,
          files,
        };
        if (!scenarioAnswer.repositoryUrl && !scenarioAnswer.artifactUrl && !scenarioAnswer.submissionNotes && !scenarioAnswer.files) {
          scenarioAnswer = undefined;
        }
      }
      return {
        itemId: r.itemId,
        answerIndexes,
        textAnswers,
        matchingAnswers,
        orderingAnswer,
        essayAnswer: essayAnswer && essayAnswer.length > 0 ? essayAnswer : undefined,
        numericAnswer,
        hotspotAnswers,
        dragDropAnswers,
        scenarioAnswer,
      };
    });
    for (const r of normalized) {
      const existing = attempt.responses.find(x => x.itemId === r.itemId);
      if (existing) {
        existing.answerIndexes = r.answerIndexes;
        existing.textAnswers = r.textAnswers;
        existing.matchingAnswers = r.matchingAnswers;
        existing.orderingAnswer = r.orderingAnswer;
        existing.essayAnswer = r.essayAnswer;
        existing.numericAnswer = r.numericAnswer;
        existing.hotspotAnswers = r.hotspotAnswers;
        existing.dragDropAnswers = r.dragDropAnswers;
        existing.scenarioAnswer = r.scenarioAnswer;
      } else {
        attempt.responses.push(r);
      }
    }
    attempt.updatedAt = new Date().toISOString();
    attemptRepository.save(attempt);
    return attempt;
  });

  app.post('/:id/submit', async (req, reply) => {
    if (!ensureAttemptAccess(req, reply)) return;
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const attempt = attemptRepository.getById(tenantId, id);
    if (!attempt) { reply.code(404); return { error: 'Not found' }; }
    if (attempt.status !== 'in_progress') { reply.code(400); return { error: 'Already submitted' }; }
    const assessment = assessmentRepository.getById(tenantId, attempt.assessmentId)!;
    let score = 0; let maxScore = 0;
    const pendingFreeResponseEvaluations: Array<{
      attemptId: string;
      itemId: string;
      itemKind: 'SHORT_ANSWER' | 'ESSAY';
      prompt: string;
      mode: 'manual' | 'ai_rubric';
      maxScore: number;
      aiEvaluatorId?: string;
      rubricKeywords?: string[];
      rubricGuidance?: string;
      rubricSections?: { id: string; title: string; description?: string; maxScore: number; keywords?: string[] }[];
      sampleAnswer?: string;
      lengthExpectation?: { minWords?: number; maxWords?: number; recommendedWords?: number };
      responseText?: string;
    }> = [];
    const pendingScenarioEvaluations: Array<{
      attemptId: string;
      itemId: string;
      prompt: string;
      brief: string;
      evaluation: ScenarioEvaluationConfig;
      scoring: ScenarioScoringRule;
      attachments?: ScenarioAttachment[];
      workspace?: ScenarioWorkspaceTemplate;
      response?: AttemptResponse['scenarioAnswer'];
    }> = [];
    for (const itemId of assessment.itemIds) {
      const item = itemRepository.getById(tenantId, itemId); if (!item) continue;
      const response = attempt.responses.find(r => r.itemId === itemId);
      if (item.kind === 'FILL_IN_THE_BLANK') {
        const result = scoreFillBlankItem(item, response?.textAnswers);
        score += result.score;
        maxScore += result.maxScore;
        continue;
      }
      if (item.kind === 'SCENARIO_TASK') {
        const scenarioScore = item.scoring?.maxScore ?? 0;
        maxScore += scenarioScore;
        pendingScenarioEvaluations.push({
          attemptId: attempt.id,
          itemId: item.id,
          prompt: item.prompt,
          brief: item.brief,
          evaluation: item.evaluation,
          scoring: item.scoring,
          attachments: item.attachments,
          workspace: item.workspace,
          response: response?.scenarioAnswer,
        });
        continue;
      }
      if (item.kind === 'MATCHING') {
        const matchingResult = scoreMatchingItem(item, response?.matchingAnswers);
        maxScore += matchingResult.maxScore;
        score += matchingResult.score;
        continue;
      }
      if (item.kind === 'ORDERING') {
        const orderingResult = scoreOrderingItem(item, response?.orderingAnswer);
        maxScore += orderingResult.maxScore;
        score += orderingResult.score;
        continue;
      }
      if (item.kind === 'SHORT_ANSWER') {
        const shortAnswerScore = item.scoring?.maxScore ?? 1;
        maxScore += shortAnswerScore;
        const responseText = (response?.essayAnswer?.trim() || response?.textAnswers?.[0]?.trim()) ?? '';
        pendingFreeResponseEvaluations.push({
          attemptId: attempt.id,
          itemId: item.id,
          itemKind: 'SHORT_ANSWER',
          prompt: item.prompt,
          mode: item.scoring.mode,
          maxScore: shortAnswerScore,
          aiEvaluatorId: item.scoring.aiEvaluatorId,
          rubricKeywords: item.rubric?.keywords,
          rubricGuidance: item.rubric?.guidance,
          sampleAnswer: item.rubric?.sampleAnswer,
          responseText,
        });
        continue;
      }
      if (item.kind === 'ESSAY') {
        const essayScore = item.scoring?.maxScore ?? 10;
        maxScore += essayScore;
        pendingFreeResponseEvaluations.push({
          attemptId: attempt.id,
          itemId: item.id,
          itemKind: 'ESSAY',
          prompt: item.prompt,
          mode: item.scoring.mode,
          maxScore: essayScore,
          aiEvaluatorId: item.scoring.aiEvaluatorId,
          rubricKeywords: item.rubric?.keywords,
          rubricGuidance: item.rubric?.guidance,
          rubricSections: item.rubric?.sections,
          sampleAnswer: item.rubric?.sampleAnswer,
          lengthExpectation: item.length,
          responseText: response?.essayAnswer?.trim(),
        });
        continue;
      }
      if (item.kind === 'NUMERIC_ENTRY') {
        const result = scoreNumericEntryItem(item, response?.numericAnswer);
        score += result.score;
        maxScore += result.maxScore;
        continue;
      }
      if (item.kind === 'HOTSPOT') {
        const result = scoreHotspotItem(item, response?.hotspotAnswers);
        score += result.score;
        maxScore += result.maxScore;
        continue;
      }
      if (item.kind === 'DRAG_AND_DROP') {
        const result = scoreDragDropItem(item, response?.dragDropAnswers);
        score += result.score;
        maxScore += result.maxScore;
        continue;
      }
      if (item.kind === 'MCQ') {
        const result = scoreMcqItem(item, response?.answerIndexes);
        score += result.score;
        maxScore += result.maxScore;
        continue;
      }
      if (item.kind === 'TRUE_FALSE') {
        const result = scoreTrueFalseItem(item, response?.answerIndexes);
        score += result.score;
        maxScore += result.maxScore;
        continue;
      }
    }
    attempt.score = score; attempt.maxScore = maxScore;
    const hasPendingFreeResponse = pendingFreeResponseEvaluations.length > 0;
    const hasPendingScenarioEvaluations = pendingScenarioEvaluations.length > 0;
    const hasPendingEvaluations = hasPendingFreeResponse || hasPendingScenarioEvaluations;
    attempt.status = hasPendingEvaluations ? 'submitted' : 'scored';
    attempt.updatedAt = new Date().toISOString();
    attemptRepository.save(attempt);
    if (hasPendingFreeResponse) {
      for (const evaluation of pendingFreeResponseEvaluations) {
        eventBus.publish({
          id: uuid(),
          type: 'FreeResponseEvaluationRequested',
          occurredAt: new Date().toISOString(),
          tenantId: attempt.tenantId,
          payload: {
            attemptId: evaluation.attemptId,
            itemId: evaluation.itemId,
            itemKind: evaluation.itemKind,
            prompt: evaluation.prompt,
            mode: evaluation.mode,
            maxScore: evaluation.maxScore,
            aiEvaluatorId: evaluation.aiEvaluatorId,
            rubricKeywords: evaluation.rubricKeywords,
            rubricGuidance: evaluation.rubricGuidance,
            rubricSections: evaluation.rubricSections,
            sampleAnswer: evaluation.sampleAnswer,
            lengthExpectation: evaluation.lengthExpectation,
            responseText: evaluation.responseText,
          },
        });
      }
    }
    if (hasPendingScenarioEvaluations) {
      for (const evaluation of pendingScenarioEvaluations) {
        eventBus.publish({
          id: uuid(),
          type: 'ScenarioEvaluationRequested',
          occurredAt: new Date().toISOString(),
          tenantId: attempt.tenantId,
          payload: {
            attemptId: evaluation.attemptId,
            itemId: evaluation.itemId,
            prompt: evaluation.prompt,
            brief: evaluation.brief,
            evaluation: evaluation.evaluation,
            scoring: evaluation.scoring,
            attachments: evaluation.attachments,
            workspace: evaluation.workspace,
            response: evaluation.response,
          },
        });
      }
    }
    if (!hasPendingEvaluations) {
      eventBus.publish({ id: uuid(), type: 'AttemptScored', occurredAt: new Date().toISOString(), tenantId: attempt.tenantId, payload: { attemptId: id, score } });
    }
    return attempt;
  });

  app.get('/:id', async (req, reply) => {
    if (!ensureAttemptAccess(req, reply)) return;
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const attempt = attemptRepository.getById(tenantId, id);
    if (!attempt) { reply.code(404); return { error: 'Not found' }; }
    return attempt;
  });

  app.get('/user/:userId', async (req, reply) => {
    if (!ensureAttemptAccess(req, reply)) return;
    const userId = (req.params as any).userId as string;
    const tenantId = (req as any).tenantId as string;
    return attemptRepository.listByUser(tenantId, userId);
  });
}
