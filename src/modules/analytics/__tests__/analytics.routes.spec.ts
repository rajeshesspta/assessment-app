import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({
  store: new Map<string, any>(),
}));

vi.mock('../../attempts/attempt.repository.js', () => ({
  attemptRepository: {
    store,
  },
}));

import { analyticsRoutes } from '../analytics.routes.js';

async function buildApp() {
  const app = Fastify();
  await app.register(analyticsRoutes, { prefix: '/analytics' });
  return app;
}

describe('analyticsRoutes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    store.clear();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('computes attempt count and average only from scored attempts', async () => {
    store.set('attempt-1', {
      id: 'attempt-1',
      assessmentId: 'assessment-1',
      status: 'scored',
      score: 3,
    });
    store.set('attempt-2', {
      id: 'attempt-2',
      assessmentId: 'assessment-1',
      status: 'scored',
      score: 5,
    });
    store.set('attempt-3', {
      id: 'attempt-3',
      assessmentId: 'assessment-1',
      status: 'in_progress',
      score: 10,
    });
    store.set('attempt-4', {
      id: 'attempt-4',
      assessmentId: 'assessment-2',
      status: 'scored',
      score: 7,
    });

    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      assessmentId: 'assessment-1',
      attemptCount: 2,
      averageScore: 4,
    });
  });

  it('returns zero metrics when no scored attempts', async () => {
    store.set('attempt-5', {
      id: 'attempt-5',
      assessmentId: 'assessment-2',
      status: 'in_progress',
    });

    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-2' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      assessmentId: 'assessment-2',
      attemptCount: 0,
      averageScore: 0,
    });
  });
});
