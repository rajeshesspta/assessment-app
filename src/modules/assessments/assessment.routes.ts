import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createAssessment } from './assessment.model.js';
import type { AssessmentRepository } from './assessment.repository.js';
import { eventBus } from '../../common/event-bus.js';

const createSchema = z.object({
  title: z.string().min(1),
  itemIds: z.array(z.string()).min(1),
});

export interface AssessmentRoutesOptions {
  repository: AssessmentRepository;
}

export async function assessmentRoutes(app: FastifyInstance, options: AssessmentRoutesOptions) {
  const { repository } = options;
  app.post('/', async (req, reply) => {
    const tenantId = (req as any).tenantId as string;
    const parsed = createSchema.parse(req.body);
    const id = uuid();
    const assessment = createAssessment({ id, tenantId, ...parsed });
    repository.save(assessment);
    eventBus.publish({ id: uuid(), type: 'AssessmentCreated', occurredAt: new Date().toISOString(), tenantId, payload: { assessmentId: id } });
    reply.code(201);
    return assessment;
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const a = repository.get(id);
    if (!a) { reply.code(404); return { error: 'Not found' }; }
    return a;
  });
}
