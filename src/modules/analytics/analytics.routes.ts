import { FastifyInstance } from 'fastify';
import type { AttemptRepository } from '../attempts/attempt.repository.js';

export interface AnalyticsRoutesOptions {
  attemptRepository: AttemptRepository;
}

export async function analyticsRoutes(app: FastifyInstance, options: AnalyticsRoutesOptions) {
  const { attemptRepository } = options;
  app.get('/assessments/:id', async (req, reply) => {
    const assessmentId = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const attempts = attemptRepository.listByAssessment(tenantId, assessmentId).filter(a => a.status === 'scored');
    const count = attempts.length;
    const avg = count === 0 ? 0 : attempts.reduce((acc: number, a: any) => acc + (a.score ?? 0), 0) / count;
    return { assessmentId, attemptCount: count, averageScore: avg };
  });
}
