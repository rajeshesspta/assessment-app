import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const attemptStore = new Map<string, any>();
  return {
    attemptStore,
    saveMock: vi.fn((attempt) => {
      attemptStore.set(attempt.id, attempt);
      return attempt;
    }),
    getByIdMock: vi.fn((tenantId: string, id: string) => {
      const attempt = attemptStore.get(id);
      return attempt?.tenantId === tenantId ? attempt : undefined;
    }),
    assessmentGetByIdMock: vi.fn(),
    assessmentSaveMock: vi.fn(),
    itemGetByIdMock: vi.fn(),
    itemSaveMock: vi.fn(),
    publishMock: vi.fn(),
    uuidMock: vi.fn(),
    listByAssessmentMock: vi.fn(),
  };
});

vi.mock('../../../common/event-bus.js', () => ({
  eventBus: {
    publish: mocks.publishMock,
  },
}));

vi.mock('uuid', () => ({
  v4: mocks.uuidMock,
}));

import { attemptRoutes } from '../attempt.routes.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
  });
  await app.register(attemptRoutes, {
    prefix: '/attempts',
    attemptRepository: {
      save: mocks.saveMock,
      getById: mocks.getByIdMock,
      listByAssessment: mocks.listByAssessmentMock,
    },
    assessmentRepository: {
      save: mocks.assessmentSaveMock,
      getById: mocks.assessmentGetByIdMock,
    },
    itemRepository: {
      save: mocks.itemSaveMock,
      getById: mocks.itemGetByIdMock,
    },
  });
  return app;
}

describe('attemptRoutes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    mocks.attemptStore.clear();
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('starts an attempt for a valid assessment', async () => {
    mocks.assessmentGetByIdMock.mockReturnValueOnce({
      id: 'assessment-1',
      tenantId: 'tenant-1',
      itemIds: ['item-1'],
    });
    mocks.uuidMock.mockReturnValueOnce('attempt-1').mockReturnValueOnce('event-1');

    const response = await app.inject({
      method: 'POST',
      url: '/attempts',
      payload: {
        assessmentId: 'assessment-1',
        userId: 'user-1',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'in_progress',
      responses: [],
    });
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    expect(mocks.publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'AttemptStarted',
      payload: { attemptId: 'attempt-1' },
    }));
    expect(mocks.assessmentGetByIdMock).toHaveBeenCalledWith('tenant-1', 'assessment-1');
  });

  it('rejects start when assessment missing', async () => {
    mocks.assessmentGetByIdMock.mockReturnValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/attempts',
      payload: {
        assessmentId: 'unknown',
        userId: 'user-1',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid assessmentId' });
    expect(mocks.publishMock).not.toHaveBeenCalled();
    expect(mocks.assessmentGetByIdMock).toHaveBeenCalledWith('tenant-1', 'unknown');
  });

  it('updates responses on patch', async () => {
    const attempt = {
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'in_progress' as const,
      responses: [{ itemId: 'item-1', answerIndexes: [1] }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-1', attempt);

    const response = await app.inject({
      method: 'PATCH',
      url: '/attempts/attempt-1/responses',
      payload: {
        responses: [
          { itemId: 'item-1', answerIndexes: [2] },
          { itemId: 'item-2', answerIndexes: [0] },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.responses).toEqual([
      { itemId: 'item-1', answerIndexes: [2] },
      { itemId: 'item-2', answerIndexes: [0] },
    ]);
    expect(body.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    expect(mocks.saveMock).toHaveBeenCalledWith(attempt);
  });

  it('accepts legacy answerIndex payloads', async () => {
    const attempt = {
      id: 'attempt-2',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'in_progress' as const,
      responses: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-2', attempt);

    const response = await app.inject({
      method: 'PATCH',
      url: '/attempts/attempt-2/responses',
      payload: {
        responses: [{ itemId: 'item-1', answerIndex: 3 }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().responses).toEqual([{ itemId: 'item-1', answerIndexes: [3] }]);
  });

  it('returns 404 when patching missing attempt', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/attempts/missing/responses',
      payload: { responses: [] },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 400 on patch when attempt not editable', async () => {
    mocks.attemptStore.set('attempt-1', {
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'scored' as const,
      responses: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/attempts/attempt-1/responses',
      payload: { responses: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Attempt not editable' });
  });

  it('submits attempt, scores answers, and emits event', async () => {
    const attempt = {
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'in_progress' as const,
      responses: [
        { itemId: 'item-1', answerIndexes: [0] },
        { itemId: 'item-2', answerIndexes: [1] },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-1', attempt);
    mocks.assessmentGetByIdMock.mockReturnValueOnce({
      id: 'assessment-1',
      tenantId: 'tenant-1',
      itemIds: ['item-1', 'item-2'],
    });
    mocks.itemGetByIdMock.mockImplementation((_tenantId: string, itemId: string) => {
      if (itemId === 'item-1') {
        return { id: 'item-1', answerMode: 'single', correctIndexes: [0] };
      }
      if (itemId === 'item-2') {
        return { id: 'item-2', answerMode: 'multiple', correctIndexes: [1, 2] };
      }
      return undefined;
    });
    mocks.uuidMock.mockReturnValueOnce('score-event');

    const response = await app.inject({
      method: 'POST',
      url: '/attempts/attempt-1/submit',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('scored');
    expect(body.score).toBe(1);
    expect(body.maxScore).toBe(2);
    expect(body.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    expect(mocks.publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'AttemptScored',
      payload: { attemptId: 'attempt-1', score: 1 },
    }));
    expect(mocks.assessmentGetByIdMock).toHaveBeenCalledWith('tenant-1', 'assessment-1');
    expect(mocks.itemGetByIdMock).toHaveBeenCalledWith('tenant-1', 'item-1');
  });

  it('scores multi-answer items when all correct indexes are provided', async () => {
    const attempt = {
      id: 'attempt-2',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-2',
      userId: 'user-2',
      status: 'in_progress' as const,
      responses: [{ itemId: 'item-3', answerIndexes: [0, 2] }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-2', attempt);
    mocks.assessmentGetByIdMock.mockReturnValueOnce({
      id: 'assessment-2',
      tenantId: 'tenant-1',
      itemIds: ['item-3'],
    });
    mocks.itemGetByIdMock.mockReturnValueOnce({
      id: 'item-3',
      answerMode: 'multiple',
      correctIndexes: [0, 2],
    });
    mocks.uuidMock.mockReturnValueOnce('score-event-2');

    const response = await app.inject({ method: 'POST', url: '/attempts/attempt-2/submit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ score: 1, maxScore: 1, status: 'scored' });
  });

  it('returns 404 when submitting missing attempt', async () => {
    const response = await app.inject({ method: 'POST', url: '/attempts/missing/submit' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 400 when submitting already scored attempt', async () => {
    mocks.attemptStore.set('attempt-1', {
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'scored' as const,
      responses: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    const response = await app.inject({ method: 'POST', url: '/attempts/attempt-1/submit' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Already submitted' });
  });

  it('returns attempt by id', async () => {
    const attempt = {
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'in_progress' as const,
      responses: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-1', attempt);

    const response = await app.inject({ method: 'GET', url: '/attempts/attempt-1' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(attempt);
    expect(mocks.getByIdMock).toHaveBeenCalledWith('tenant-1', 'attempt-1');
  });

  it('returns 404 when attempt missing on GET', async () => {
    const response = await app.inject({ method: 'GET', url: '/attempts/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
    expect(mocks.getByIdMock).toHaveBeenCalledWith('tenant-1', 'missing');
  });
});
