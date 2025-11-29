import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createAttempt } from './attempt.model.js';
import type { AttemptRepository } from './attempt.repository.js';
import type { AssessmentRepository } from '../assessments/assessment.repository.js';
import type { ItemRepository } from '../items/item.repository.js';
import type { FillBlankMatcher } from '../../common/types.js';
import { eventBus } from '../../common/event-bus.js';

const startSchema = z.object({ assessmentId: z.string(), userId: z.string() });
const responseSchema = z.object({
  itemId: z.string(),
  answerIndex: z.number().int().nonnegative().optional(),
  answerIndexes: z.array(z.number().int().nonnegative()).optional(),
  textAnswer: z.string().optional(),
  textAnswers: z.array(z.string()).optional(),
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
      return { itemId: r.itemId, answerIndexes, textAnswers };
    });
    for (const r of normalized) {
      const existing = attempt.responses.find(x => x.itemId === r.itemId);
      if (existing) {
        existing.answerIndexes = r.answerIndexes;
        existing.textAnswers = r.textAnswers;
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
    attempt.score = score; attempt.maxScore = maxScore; attempt.status = 'scored';
    attempt.updatedAt = new Date().toISOString();
    attemptRepository.save(attempt);
    eventBus.publish({ id: uuid(), type: 'AttemptScored', occurredAt: new Date().toISOString(), tenantId: attempt.tenantId, payload: { attemptId: id, score } });
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
