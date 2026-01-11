import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  attemptStore,
  listByAssessmentMock,
  listByLearnerMock,
  saveAttemptMock,
  getAttemptMock,
  assessmentStore,
  getAssessmentMock,
  cohortStore,
  listCohortsMock,
  itemStore,
  getItemMock,
  listItemsMock,
} = vi.hoisted(() => {
  const attemptStore: any[] = [];
  const assessmentStore = new Map<string, any>();
  const cohortStore: any[] = [];
  const itemStore = new Map<string, any>();
  const keyOf = (tenantId: string, id: string) => `${tenantId}::${id}`;

  return {
    attemptStore,
    listByAssessmentMock: vi.fn((tenantId: string, assessmentId: string) =>
      attemptStore.filter(attempt => attempt.tenantId === tenantId && attempt.assessmentId === assessmentId)
    ),
    listByLearnerMock: vi.fn(),
    saveAttemptMock: vi.fn(),
    getAttemptMock: vi.fn(),

    assessmentStore,
    getAssessmentMock: vi.fn((tenantId: string, id: string) => assessmentStore.get(keyOf(tenantId, id))),

    cohortStore,
    listCohortsMock: vi.fn((tenantId: string) => cohortStore.filter(cohort => cohort.tenantId === tenantId)),

    itemStore,
    getItemMock: vi.fn((tenantId: string, id: string) => itemStore.get(keyOf(tenantId, id))),
    listItemsMock: vi.fn(),
  };
});

import { analyticsRoutes } from '../analytics.routes.js';

let currentActorRoles: string[] = ['TENANT_ADMIN'];
let currentIsSuperAdmin = false;

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
    (request as any).actorRoles = currentActorRoles;
    (request as any).isSuperAdmin = currentIsSuperAdmin;
  });
  await app.register(analyticsRoutes, {
    prefix: '/analytics',
    attemptRepository: {
      save: saveAttemptMock,
      getById: getAttemptMock,
      listByAssessment: listByAssessmentMock,
      listByLearner: listByLearnerMock,
      listByUser: vi.fn(),
    },
    assessmentRepository: {
      save: vi.fn(),
      getById: getAssessmentMock,
      list: vi.fn(),
    },
    cohortRepository: {
      save: vi.fn(),
      getById: vi.fn(),
      list: listCohortsMock,
      listByLearner: vi.fn(),
      delete: vi.fn(),
    },
    itemRepository: {
      save: vi.fn(),
      getById: getItemMock,
      list: listItemsMock,
    },
  });
  return app;
}

describe('analyticsRoutes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    attemptStore.length = 0;
    assessmentStore.clear();
    cohortStore.length = 0;
    itemStore.clear();
    currentActorRoles = ['TENANT_ADMIN'];
    currentIsSuperAdmin = false;
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

  it('computes summary distribution and pass rate', async () => {
    attemptStore.push({
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      status: 'scored',
      score: 8,
      maxScore: 10,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:10:00.000Z',
      responses: [],
    });
    attemptStore.push({
      id: 'attempt-2',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      status: 'scored',
      score: 3,
      maxScore: 10,
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:05:00.000Z',
      responses: [],
    });
    attemptStore.push({
      id: 'attempt-3',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      status: 'in_progress',
      score: 10,
      maxScore: 10,
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-03T00:01:00.000Z',
      responses: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/assessments/assessment-1/summary?passThreshold=0.7&bucketSize=0.5',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.assessmentId).toBe('assessment-1');
    expect(body.scoredAttemptCount).toBe(2);
    expect(body.passThreshold).toBe(0.7);
    expect(body.passRate).toBe(0.5);
    expect(body.distribution.bucketSize).toBe(0.5);
    expect(typeof body.distribution.buckets).toBe('object');
  });

  it('computes funnel counts based on cohorts and attempts', async () => {
    cohortStore.push({
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Cohort 1',
      learnerIds: ['learner-1', 'learner-2'],
      assessmentIds: [],
      assignments: [{ assessmentId: 'assessment-1', allowedAttempts: 1 }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    attemptStore.push({
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'learner-1',
      status: 'submitted',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:02:00.000Z',
      responses: [],
    });
    attemptStore.push({
      id: 'attempt-2',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'learner-2',
      status: 'scored',
      score: 1,
      maxScore: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:03:00.000Z',
      responses: [],
    });

    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-1/funnel' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      assessmentId: 'assessment-1',
      assignedLearnerCount: 2,
      startedLearnerCount: 2,
      submittedLearnerCount: 2,
      scoredLearnerCount: 1,
      attemptCount: 2,
    });
  });

  it('computes attempts usage aggregates', async () => {
    assessmentStore.set('tenant-1::assessment-1', {
      id: 'assessment-1',
      tenantId: 'tenant-1',
      title: 'Assessment',
      allowedAttempts: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    cohortStore.push({
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Cohort 1',
      learnerIds: ['learner-1', 'learner-2'],
      assessmentIds: [],
      assignments: [{ assessmentId: 'assessment-1', allowedAttempts: 2 }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    attemptStore.push({
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'learner-1',
      status: 'submitted',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:01:00.000Z',
      responses: [],
    });
    attemptStore.push({
      id: 'attempt-2',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'learner-1',
      status: 'submitted',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:02:00.000Z',
      responses: [],
    });

    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-1/attempts-usage' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      assessmentId: 'assessment-1',
      assignedLearnerCount: 2,
      learnersAttemptedCount: 1,
      learnersExhaustedCount: 1,
      averageAttemptsUsed: 1,
      maxAttemptsUsed: 2,
    });
  });

  it('returns most missed items ordered by lowest perfect rate', async () => {
    assessmentStore.set('tenant-1::assessment-1', {
      id: 'assessment-1',
      tenantId: 'tenant-1',
      title: 'Assessment',
      allowedAttempts: 1,
      itemIds: ['item-1', 'item-2'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    itemStore.set('tenant-1::item-1', {
      id: 'item-1',
      tenantId: 'tenant-1',
      kind: 'MCQ',
      prompt: 'Q1',
      answerMode: 'single',
      options: ['a', 'b'],
      correctIndexes: [0],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    itemStore.set('tenant-1::item-2', {
      id: 'item-2',
      tenantId: 'tenant-1',
      kind: 'MCQ',
      prompt: 'Q2',
      answerMode: 'single',
      options: ['a', 'b'],
      correctIndexes: [1],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    // item-1: 0% perfect, item-2: 100% perfect
    attemptStore.push({
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      status: 'scored',
      score: 0,
      maxScore: 2,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:05:00.000Z',
      responses: [
        { itemId: 'item-1', answerIndexes: [1] },
        { itemId: 'item-2', answerIndexes: [1] },
      ],
    });

    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-1/items/most-missed?limit=2' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.assessmentId).toBe('assessment-1');
    expect(body.items).toHaveLength(2);
    expect(body.items[0].itemId).toBe('item-1');
    expect(body.items[1].itemId).toBe('item-2');
  });

  it('rejects super admin callers', async () => {
    currentIsSuperAdmin = true;
    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-1' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('requires analytics roles', async () => {
    currentActorRoles = ['LEARNER'];
    const response = await app.inject({ method: 'GET', url: '/analytics/assessments/assessment-1' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });
});
