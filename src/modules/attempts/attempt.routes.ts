import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createAttempt } from './attempt.model.js';
import type { AttemptRepository } from './attempt.repository.js';
import type { AssessmentRepository } from '../assessments/assessment.repository.js';
import type { ItemRepository } from '../items/item.repository.js';
import type { FillBlankMatcher, HotspotPoint } from '../../common/types.js';
import { eventBus } from '../../common/event-bus.js';

const startSchema = z.object({ assessmentId: z.string(), userId: z.string() });
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
});

const responsesSchema = z.object({ responses: z.array(responseSchema) });

export interface AttemptRoutesOptions {
  attemptRepository: AttemptRepository;
  assessmentRepository: AssessmentRepository;
  itemRepository: ItemRepository;
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

function matchesFillBlankAnswer(value: string, matcher: FillBlankMatcher): boolean {
  if (matcher.type === 'exact') {
    if (matcher.caseSensitive) {
      return value === matcher.value;
    }
    return value.localeCompare(matcher.value, undefined, { sensitivity: 'accent' }) === 0;
  }
  try {
    const regex = new RegExp(matcher.pattern, matcher.flags ?? 'i');
    return regex.test(value);
  } catch {
    return false;
  }
}

function isPointInPolygon(point: HotspotPoint, polygon: HotspotPoint[]): boolean {
  if (!polygon || polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export async function attemptRoutes(app: FastifyInstance, options: AttemptRoutesOptions) {
  const { attemptRepository, assessmentRepository, itemRepository } = options;
  app.post('/', async (req, reply) => {
    const tenantId = (req as any).tenantId as string;
    const parsed = startSchema.parse(req.body);
    const assessment = assessmentRepository.getById(tenantId, parsed.assessmentId);
    if (!assessment) { reply.code(400); return { error: 'Invalid assessmentId' }; }
    const id = uuid();
    const attempt = createAttempt({ id, tenantId, assessmentId: assessment.id, userId: parsed.userId });
    attemptRepository.save(attempt);
    eventBus.publish({ id: uuid(), type: 'AttemptStarted', occurredAt: new Date().toISOString(), tenantId, payload: { attemptId: id } });
    reply.code(201);
    return attempt;
  });

  app.patch('/:id/responses', async (req, reply) => {
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
      } else {
        attempt.responses.push(r);
      }
    }
    attempt.updatedAt = new Date().toISOString();
    attemptRepository.save(attempt);
    return attempt;
  });

  app.post('/:id/submit', async (req, reply) => {
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
      lengthExpectation?: { minWords?: number; maxWords?: number; recommendedWords?: number };
      responseText?: string;
    }> = [];
    for (const itemId of assessment.itemIds) {
      const item = itemRepository.getById(tenantId, itemId); if (!item) continue;
      const response = attempt.responses.find(r => r.itemId === itemId);
      if (item.kind === 'FILL_IN_THE_BLANK') {
        const blanks = item.blanks ?? [];
        const provided = response?.textAnswers ?? [];
        const blanksCorrect = blanks.reduce((total, blank, index) => {
          const candidate = provided[index]?.trim();
          if (!candidate) {
            return total;
          }
          const isMatch = blank.acceptableAnswers.some(matcher => matchesFillBlankAnswer(candidate, matcher));
          return isMatch ? total + 1 : total;
        }, 0);
        if (item.scoring.mode === 'partial') {
          maxScore += blanks.length;
          score += blanksCorrect;
        } else {
          maxScore += 1;
          if (blanksCorrect === blanks.length && blanks.length > 0) {
            score += 1;
          }
        }
        continue;
      }
      if (item.kind === 'MATCHING') {
        const prompts = item.prompts ?? [];
        if (item.scoring.mode === 'partial') {
          maxScore += prompts.length;
        } else {
          maxScore += 1;
        }
        const provided = response?.matchingAnswers ?? [];
        const correctByPrompt = new Map(prompts.map(prompt => [prompt.id, prompt.correctTargetId] as const));
        const matches = provided.reduce((total, pair) => {
          const expected = correctByPrompt.get(pair.promptId);
          return expected && expected === pair.targetId ? total + 1 : total;
        }, 0);
        if (item.scoring.mode === 'partial') {
          score += matches;
        } else if (matches === prompts.length && prompts.length > 0) {
          score += 1;
        }
        continue;
      }
      if (item.kind === 'ORDERING') {
        const totalPairs = item.correctOrder.length * (item.correctOrder.length - 1) / 2;
        if (item.scoring.mode === 'partial_pairs') {
          maxScore += totalPairs;
        } else {
          maxScore += 1;
        }
        if (item.scoring.customEvaluatorId) {
          continue;
        }
        const provided = response?.orderingAnswer ?? [];
        if (item.scoring.mode === 'all') {
          const isCorrect = provided.length === item.correctOrder.length
            && item.correctOrder.every((value, index) => value === provided[index]);
          if (isCorrect && item.correctOrder.length > 0) {
            score += 1;
          }
          continue;
        }
        const providedIndex = new Map(provided.map((optionId, index) => [optionId, index] as const));
        let correctPairs = 0;
        for (let i = 0; i < item.correctOrder.length; i += 1) {
          for (let j = i + 1; j < item.correctOrder.length; j += 1) {
            const first = item.correctOrder[i];
            const second = item.correctOrder[j];
            const posFirst = providedIndex.get(first);
            const posSecond = providedIndex.get(second);
            if (posFirst === undefined || posSecond === undefined) {
              continue;
            }
            if (posFirst < posSecond) {
              correctPairs += 1;
            }
          }
        }
        score += correctPairs;
        continue;
      }
      if (item.kind === 'SHORT_ANSWER') {
        const shortAnswerScore = item.scoring?.maxScore ?? 1;
        maxScore += shortAnswerScore;
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
          responseText: response?.textAnswers?.[0]?.trim(),
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
          lengthExpectation: item.length,
          responseText: response?.essayAnswer?.trim(),
        });
        continue;
      }
      if (item.kind === 'NUMERIC_ENTRY') {
        maxScore += 1;
        const provided = response?.numericAnswer?.value;
        if (typeof provided === 'number' && Number.isFinite(provided)) {
          let isCorrect = false;
          if (item.validation.mode === 'exact') {
            const tolerance = item.validation.tolerance ?? 0;
            isCorrect = Math.abs(provided - item.validation.value) <= tolerance;
          } else {
            isCorrect = provided >= item.validation.min && provided <= item.validation.max;
          }
          if (isCorrect) {
            score += 1;
          }
        }
        continue;
      }
      if (item.kind === 'HOTSPOT') {
        const hotspotCount = item.hotspots.length;
        if (hotspotCount === 0) {
          continue;
        }
        const selectionLimit = item.scoring.maxSelections ?? hotspotCount;
        const selectionBudget = Math.min(hotspotCount, Math.max(1, selectionLimit));
        if (item.scoring.mode === 'partial') {
          maxScore += selectionBudget;
        } else {
          maxScore += 1;
        }
        const provided = (response?.hotspotAnswers ?? []).slice(0, selectionBudget);
        if (provided.length === 0) {
          continue;
        }
        const matched = new Set<string>();
        for (const answer of provided) {
          const region = item.hotspots.find(hotspot => isPointInPolygon(answer, hotspot.points));
          if (region) {
            matched.add(region.id);
          }
        }
        if (item.scoring.mode === 'partial') {
          score += matched.size;
        } else if (matched.size === hotspotCount && hotspotCount > 0) {
          score += 1;
        }
        continue;
      }
      if (item.kind === 'DRAG_AND_DROP') {
        const zones = item.zones ?? [];
        if (zones.length === 0) {
          continue;
        }
        const totalTokenCredit = zones.reduce((total, zone) => total + zone.correctTokenIds.length, 0);
        if (item.scoring.mode === 'per_zone') {
          maxScore += zones.length;
        } else if (item.scoring.mode === 'per_token') {
          maxScore += totalTokenCredit;
        } else {
          maxScore += 1;
        }
        const provided = response?.dragDropAnswers ?? [];
        if (provided.length === 0) {
          continue;
        }
        const zoneIds = new Set(zones.map(zone => zone.id));
        const allowedTokenIds = new Set(item.tokens.map(token => token.id));
        const placementsByZone = new Map<string, { tokenId: string; position?: number }[]>();
        for (const placement of provided) {
          if (!zoneIds.has(placement.dropZoneId) || !allowedTokenIds.has(placement.tokenId)) {
            continue;
          }
          const list = placementsByZone.get(placement.dropZoneId) ?? [];
          list.push({ tokenId: placement.tokenId, position: placement.position });
          placementsByZone.set(placement.dropZoneId, list);
        }
        let correctZoneCount = 0;
        let correctTokenCount = 0;
        for (const zone of zones) {
          const placements = placementsByZone.get(zone.id) ?? [];
          const sortedPlacements = zone.evaluation === 'ordered'
            ? placements
                .slice()
                .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
            : placements;
          const limitedPlacements = zone.maxTokens
            ? sortedPlacements.slice(0, zone.maxTokens)
            : sortedPlacements;
          if (zone.evaluation === 'ordered') {
            const providedOrder = limitedPlacements.map(p => p.tokenId);
            const expected = zone.correctTokenIds;
            const isZoneCorrect = providedOrder.length === expected.length
              && expected.every((tokenId, index) => tokenId === providedOrder[index]);
            if (isZoneCorrect) {
              correctZoneCount += 1;
              correctTokenCount += expected.length;
            } else if (item.scoring.mode === 'per_token') {
              for (let i = 0; i < expected.length && i < providedOrder.length; i += 1) {
                if (providedOrder[i] === expected[i]) {
                  correctTokenCount += 1;
                }
              }
            }
            continue;
          }
          const providedSet = new Set(limitedPlacements.map(p => p.tokenId));
          const expectedSet = new Set(zone.correctTokenIds);
          const missing = zone.correctTokenIds.find(tokenId => !providedSet.has(tokenId));
          const extra = providedSet.size > expectedSet.size
            ? Array.from(providedSet).find(tokenId => !expectedSet.has(tokenId))
            : undefined;
          if (!missing && !extra && expectedSet.size === providedSet.size) {
            correctZoneCount += 1;
          }
          if (item.scoring.mode === 'per_token') {
            for (const tokenId of zone.correctTokenIds) {
              if (providedSet.has(tokenId)) {
                correctTokenCount += 1;
              }
            }
          }
        }
        if (item.scoring.mode === 'all') {
          if (correctZoneCount === zones.length && zones.length > 0) {
            score += 1;
          }
        } else if (item.scoring.mode === 'per_zone') {
          score += correctZoneCount;
        } else {
          score += correctTokenCount;
        }
        continue;
      }
      maxScore += 1;
      const correct = new Set(item.correctIndexes);
      const answers = response?.answerIndexes ? Array.from(new Set(response.answerIndexes)).sort((a, b) => a - b) : [];
      const expected = [...correct].sort((a, b) => a - b);
      if (item.answerMode === 'single') {
        if (answers.length === 1 && answers[0] === expected[0]) score++;
        continue;
      }
      if (answers.length === expected.length && expected.every((value, idx) => value === answers[idx])) {
        score++;
      }
    }
    attempt.score = score; attempt.maxScore = maxScore;
    const hasPendingFreeResponse = pendingFreeResponseEvaluations.length > 0;
    attempt.status = hasPendingFreeResponse ? 'submitted' : 'scored';
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
            lengthExpectation: evaluation.lengthExpectation,
            responseText: evaluation.responseText,
          },
        });
      }
    } else {
      eventBus.publish({ id: uuid(), type: 'AttemptScored', occurredAt: new Date().toISOString(), tenantId: attempt.tenantId, payload: { attemptId: id, score } });
    }
    return attempt;
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const attempt = attemptRepository.getById(tenantId, id);
    if (!attempt) { reply.code(404); return { error: 'Not found' }; }
    return attempt;
  });
}
