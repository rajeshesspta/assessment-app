import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createAttempt } from './attempt.model.js';
import { attemptRepository } from './attempt.repository.js';
import { assessmentRepository } from '../assessments/assessment.repository.js';
import { itemRepository } from '../items/item.repository.js';
import { eventBus } from '../../common/event-bus.js';

const startSchema = z.object({ assessmentId: z.string(), userId: z.string() });
const responsesSchema = z.object({ responses: z.array(z.object({ itemId: z.string(), answerIndex: z.number().int().nonnegative().optional() })) });

export async function attemptRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const tenantId = (req as any).tenantId as string;
    const parsed = startSchema.parse(req.body);
    const assessment = assessmentRepository.get(parsed.assessmentId);
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
    const attempt = attemptRepository.get(id);
    if (!attempt) { reply.code(404); return { error: 'Not found' }; }
    if (attempt.status !== 'in_progress') { reply.code(400); return { error: 'Attempt not editable' }; }
    const parsed = responsesSchema.parse(req.body);
    for (const r of parsed.responses) {
      const existing = attempt.responses.find(x => x.itemId === r.itemId);
      if (existing) Object.assign(existing, r); else attempt.responses.push(r);
    }
    attempt.updatedAt = new Date().toISOString();
    attemptRepository.save(attempt);
    return attempt;
  });

  app.post('/:id/submit', async (req, reply) => {
    const id = (req.params as any).id as string;
    const attempt = attemptRepository.get(id);
    if (!attempt) { reply.code(404); return { error: 'Not found' }; }
    if (attempt.status !== 'in_progress') { reply.code(400); return { error: 'Already submitted' }; }
    const assessment = assessmentRepository.get(attempt.assessmentId)!;
    // Auto scoring MCQ
    let score = 0; let maxScore = assessment.itemIds.length;
    for (const itemId of assessment.itemIds) {
      const item = itemRepository.get(itemId); if (!item) continue;
      const response = attempt.responses.find(r => r.itemId === itemId);
      if (response && response.answerIndex === item.correctIndex) score++;
    }
    attempt.score = score; attempt.maxScore = maxScore; attempt.status = 'scored';
    attempt.updatedAt = new Date().toISOString();
    attemptRepository.save(attempt);
    eventBus.publish({ id: uuid(), type: 'AttemptScored', occurredAt: new Date().toISOString(), tenantId: attempt.tenantId, payload: { attemptId: id, score } });
    return attempt;
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const attempt = attemptRepository.get(id);
    if (!attempt) { reply.code(404); return { error: 'Not found' }; }
    return attempt;
  });
}
