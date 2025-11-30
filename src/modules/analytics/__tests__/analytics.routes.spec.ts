import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { attemptStore, listByAssessmentMock, listByLearnerMock, saveMock, getMock } = vi.hoisted(() => {
  const attemptStore: any[] = [];
  return {
    attemptStore,
    listByAssessmentMock: vi.fn((tenantId: string, assessmentId: string) =>
      attemptStore.filter(attempt => attempt.tenantId === tenantId && attempt.assessmentId === assessmentId)
    ),
    listByLearnerMock: vi.fn(),
    saveMock: vi.fn(),
    getMock: vi.fn(),
  };
});

import { analyticsRoutes } from '../analytics.routes.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
  });
  await app.register(analyticsRoutes, {
    prefix: '/analytics',
    attemptRepository: {
      save: saveMock,
      getById: getMock,
      listByAssessment: listByAssessmentMock,
      listByLearner: listByLearnerMock,
    },
  });
  return app;
}

describe('analyticsRoutes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    attemptStore.length = 0;
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('computes attempt count and average only from scored attempts', async () => {
    attemptStore.push({
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      status: 'scored',
      score: 3,
    });
    attemptStore.push({
      id: 'attempt-2',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      status: 'scored',
      score: 5,
    });
    attemptStore.push({
      id: 'attempt-3',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      status: 'in_progress',
      score: 10,
    });
    attemptStore.push({
      id: 'attempt-4',
      tenantId: 'tenant-2',
      assessmentId: 'assessment-2',
      status: 'scored',
      score: 7,
    });

    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-1' });

    expect(response.statusCode).toBe(200);
    expect(listByAssessmentMock).toHaveBeenCalledWith('tenant-1', 'assessment-1');
    expect(response.json()).toEqual({
      assessmentId: 'assessment-1',
      attemptCount: 2,
      averageScore: 4,
    });
  });

  it('returns zero metrics when no scored attempts', async () => {
    attemptStore.push({
      id: 'attempt-5',
      tenantId: 'tenant-2',
      assessmentId: 'assessment-2',
      status: 'in_progress',
    });

    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-2' });

    expect(response.statusCode).toBe(200);
    expect(listByAssessmentMock).toHaveBeenCalledWith('tenant-1', 'assessment-2');
    expect(response.json()).toEqual({
      assessmentId: 'assessment-2',
      attemptCount: 0,
      averageScore: 0,
    });
  });
});
