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

  it('stores text answers when provided', async () => {
    const attempt = {
      id: 'attempt-text',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-2',
      userId: 'user-2',
      status: 'in_progress' as const,
      responses: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-text', attempt);

    const response = await app.inject({
      method: 'PATCH',
      url: '/attempts/attempt-text/responses',
      payload: {
        responses: [{ itemId: 'item-9', textAnswers: ['Answer One', 'Answer Two'] }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().responses).toEqual([
      { itemId: 'item-9', textAnswers: ['Answer One', 'Answer Two'] },
    ]);
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
        return {
          id: 'item-1',
          tenantId: 'tenant-1',
          kind: 'MCQ',
          prompt: 'p1',
          choices: [{ text: 'a' }, { text: 'b' }],
          answerMode: 'single',
          correctIndexes: [0],
          createdAt: 'now',
          updatedAt: 'now',
        };
      }
      if (itemId === 'item-2') {
        return {
          id: 'item-2',
          tenantId: 'tenant-1',
          kind: 'MCQ',
          prompt: 'p2',
          choices: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
          answerMode: 'multiple',
          correctIndexes: [1, 2],
          createdAt: 'now',
          updatedAt: 'now',
        };
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
      tenantId: 'tenant-1',
      kind: 'MCQ',
      prompt: 'p3',
      choices: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      answerMode: 'multiple',
      correctIndexes: [0, 2],
      createdAt: 'now',
      updatedAt: 'now',
    });
    mocks.uuidMock.mockReturnValueOnce('score-event-2');

    const response = await app.inject({ method: 'POST', url: '/attempts/attempt-2/submit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ score: 1, maxScore: 1, status: 'scored' });
  });

  it('scores fill-in-the-blank items (all mode)', async () => {
    const attempt = {
      id: 'attempt-fib',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-fib',
      userId: 'user-3',
      status: 'in_progress' as const,
      responses: [{ itemId: 'fib-item', textAnswers: ['H2O'] }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-fib', attempt);
    mocks.assessmentGetByIdMock.mockReturnValueOnce({
      id: 'assessment-fib',
      tenantId: 'tenant-1',
      itemIds: ['fib-item'],
    });
    mocks.itemGetByIdMock.mockReturnValueOnce({
      id: 'fib-item',
      tenantId: 'tenant-1',
      kind: 'FILL_IN_THE_BLANK',
      prompt: '___ is the chemical symbol for water.',
      blanks: [{
        id: 'blank-1',
        acceptableAnswers: [{ type: 'exact', value: 'H2O', caseSensitive: false }],
      }],
      scoring: { mode: 'all' },
      createdAt: 'now',
      updatedAt: 'now',
    });
    mocks.uuidMock.mockReturnValueOnce('fib-event');

    const response = await app.inject({ method: 'POST', url: '/attempts/attempt-fib/submit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ score: 1, maxScore: 1, status: 'scored' });
  });

  it('awards partial credit for multi-blank items', async () => {
    const attempt = {
      id: 'attempt-fib-partial',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-fib-partial',
      userId: 'user-4',
      status: 'in_progress' as const,
      responses: [{ itemId: 'fib-item-2', textAnswers: ['Jupiter', 'Venus'] }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-fib-partial', attempt);
    mocks.assessmentGetByIdMock.mockReturnValueOnce({
      id: 'assessment-fib-partial',
      tenantId: 'tenant-1',
      itemIds: ['fib-item-2'],
    });
    mocks.itemGetByIdMock.mockReturnValueOnce({
      id: 'fib-item-2',
      tenantId: 'tenant-1',
      kind: 'FILL_IN_THE_BLANK',
      prompt: '___ and ___ are gas giants.',
      blanks: [
        { id: 'blank-1', acceptableAnswers: [{ type: 'exact', value: 'Jupiter' }] },
        { id: 'blank-2', acceptableAnswers: [{ type: 'exact', value: 'Saturn' }] },
      ],
      scoring: { mode: 'partial' },
      createdAt: 'now',
      updatedAt: 'now',
    });
    mocks.uuidMock.mockReturnValueOnce('fib-event-2');

    const response = await app.inject({ method: 'POST', url: '/attempts/attempt-fib-partial/submit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ score: 1, maxScore: 2, status: 'scored' });
  });

  it('scores ordering items with pairwise credit', async () => {
    const attempt = {
      id: 'attempt-ordering',
      tenantId: 'tenant-1',
      assessmentId: 'assessment-ordering',
      userId: 'user-5',
      status: 'in_progress' as const,
      responses: [{ itemId: 'ordering-item', orderingAnswer: ['opt-1', 'opt-3', 'opt-2'] }],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    mocks.attemptStore.set('attempt-ordering', attempt);
    mocks.assessmentGetByIdMock.mockReturnValueOnce({
      id: 'assessment-ordering',
      tenantId: 'tenant-1',
      itemIds: ['ordering-item'],
    });
    mocks.itemGetByIdMock.mockReturnValueOnce({
      id: 'ordering-item',
      tenantId: 'tenant-1',
      kind: 'ORDERING',
      prompt: 'Rank numbers',
      options: [
        { id: 'opt-1', text: 'One' },
        { id: 'opt-2', text: 'Two' },
        { id: 'opt-3', text: 'Three' },
      ],
      correctOrder: ['opt-1', 'opt-2', 'opt-3'],
      scoring: { mode: 'partial_pairs' },
      createdAt: 'now',
      updatedAt: 'now',
    });
    mocks.uuidMock.mockReturnValueOnce('ordering-event');

    const response = await app.inject({ method: 'POST', url: '/attempts/attempt-ordering/submit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ score: 2, maxScore: 3, status: 'scored' });
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
