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
    getMock: vi.fn((id: string) => attemptStore.get(id)),
    assessmentGetMock: vi.fn(),
    assessmentSaveMock: vi.fn(),
    itemGetMock: vi.fn(),
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
      get: mocks.getMock,
      listByAssessment: mocks.listByAssessmentMock,
    },
    assessmentRepository: {
      save: mocks.assessmentSaveMock,
      get: mocks.assessmentGetMock,
    },
    itemRepository: {
      save: mocks.itemSaveMock,
      get: mocks.itemGetMock,
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
    mocks.assessmentGetMock.mockReturnValueOnce({
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
  });

  it('rejects start when assessment missing', async () => {
    mocks.assessmentGetMock.mockReturnValueOnce(undefined);

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
  });

  it('updates responses on patch', async () => {
    const attempt = {
      id: 'attempt-1',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-1',
      userId: 'user-1',
      status: 'in_progress' as const,
      responses: [{ itemId: 'item-1', answerIndex: 1 }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-1', attempt);

    const response = await app.inject({
      method: 'PATCH',
      url: '/attempts/attempt-1/responses',
      payload: {
        responses: [
          { itemId: 'item-1', answerIndex: 2 },
          { itemId: 'item-2', answerIndex: 0 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.responses).toEqual([
      { itemId: 'item-1', answerIndex: 2 },
      { itemId: 'item-2', answerIndex: 0 },
    ]);
    expect(body.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
    expect(mocks.saveMock).toHaveBeenCalledWith(attempt);
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
        { itemId: 'item-1', answerIndex: 0 },
        { itemId: 'item-2', answerIndex: 1 },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-1', attempt);
    mocks.assessmentGetMock.mockReturnValueOnce({
      id: 'assessment-1',
      tenantId: 'tenant-1',
      itemIds: ['item-1', 'item-2'],
    });
    mocks.itemGetMock.mockImplementation((itemId: string) => {
      if (itemId === 'item-1') {
        return { id: 'item-1', correctIndex: 0 };
      }
      if (itemId === 'item-2') {
        return { id: 'item-2', correctIndex: 2 };
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
  });

  it('returns 404 when attempt missing on GET', async () => {
    const response = await app.inject({ method: 'GET', url: '/attempts/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
  });
});
