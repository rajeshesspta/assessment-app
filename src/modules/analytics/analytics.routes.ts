import { FastifyInstance } from 'fastify';
import { attemptRepository } from '../attempts/attempt.repository.js';

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/assessments/:id', async (req, reply) => {
    const assessmentId = (req.params as any).id as string;
    const attempts = Array.from((attemptRepository as any).store.values()).filter((a: any) => a.assessmentId === assessmentId && a.status === 'scored');
    const count = attempts.length;
    const avg = count === 0 ? 0 : attempts.reduce((acc: number, a: any) => acc + (a.score ?? 0), 0) / count;
    return { assessmentId, attemptCount: count, averageScore: avg };
  });
}
