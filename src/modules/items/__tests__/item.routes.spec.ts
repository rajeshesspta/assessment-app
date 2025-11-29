import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveMock, getByIdMock, listMock, publishMock, uuidMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  getByIdMock: vi.fn(),
  listMock: vi.fn(),
  publishMock: vi.fn(),
  uuidMock: vi.fn(),
}));

vi.mock('../../../common/event-bus.js', () => ({
  eventBus: {
    publish: publishMock,
  },
}));

vi.mock('uuid', () => ({
  v4: uuidMock,
}));

import { itemRoutes } from '../item.routes.js';

async function buildTestApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
  });
  await app.register(itemRoutes, {
    prefix: '/items',
    repository: {
      save: saveMock,
      getById: getByIdMock,
      list: listMock,
    },
  });
  return app;
}

describe('itemRoutes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    saveMock.mockImplementation(entity => entity);
    listMock.mockReturnValue([]);
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists items with default limit', async () => {
    const results = [{ id: '1' }] as any;
    listMock.mockReturnValueOnce(results);

    const response = await app.inject({ method: 'GET', url: '/items' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(results);
    expect(listMock).toHaveBeenCalledWith('tenant-1', { search: undefined, limit: 10, offset: 0 });
  });

  it('lists items filtered by search query with paging', async () => {
    const results = [{ id: '2' }] as any;
    listMock.mockReturnValueOnce(results);

    const response = await app.inject({ method: 'GET', url: '/items?search=math&limit=5&offset=10' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(results);
    expect(listMock).toHaveBeenCalledWith('tenant-1', { search: 'math', limit: 5, offset: 10 });
  });

  it('creates an item when payload is valid', async () => {
    uuidMock.mockReturnValueOnce('item-id-1').mockReturnValueOnce('event-id-1');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'MCQ',
        prompt: 'What is 2 + 2?',
        choices: [{ text: '3' }, { text: '4' }],
        correctIndexes: [1],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: 'item-id-1',
      tenantId: 'tenant-1',
      kind: 'MCQ',
      prompt: 'What is 2 + 2?',
      choices: [{ text: '3' }, { text: '4' }],
      answerMode: 'single',
      correctIndexes: [1],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    expect(body.createdAt).toBe(body.updatedAt);
    expect(saveMock).toHaveBeenCalledWith(body);
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ItemCreated',
      tenantId: 'tenant-1',
      payload: { itemId: 'item-id-1' },
    }));
  });

  it('rejects items where correctIndexes are invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'MCQ',
        prompt: 'Capital of France?',
        choices: [{ text: 'Paris' }, { text: 'Berlin' }],
        correctIndexes: [5],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'correctIndexes out of range' });
    expect(saveMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('rejects multi-answer items without at least two indexes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'MCQ',
        prompt: 'Select prime numbers',
        choices: [{ text: '2' }, { text: '3' }, { text: '4' }],
        answerMode: 'multiple',
        correctIndexes: [0],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Multi-answer items require at least two correct indexes' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('creates a true/false item', async () => {
    uuidMock.mockReturnValueOnce('tf-item-id').mockReturnValueOnce('event-id-2');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'TRUE_FALSE',
        prompt: 'The sky is blue.',
        answerIsTrue: true,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      id: 'tf-item-id',
      tenantId: 'tenant-1',
      kind: 'TRUE_FALSE',
      prompt: 'The sky is blue.',
      choices: [{ text: 'True' }, { text: 'False' }],
      answerMode: 'single',
      correctIndexes: [0],
    });
    expect(saveMock).toHaveBeenCalledWith(body);
  });

  it('creates a fill-in-the-blank item', async () => {
    uuidMock.mockReturnValueOnce('fib-item-id').mockReturnValueOnce('event-id-3');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'FILL_IN_THE_BLANK',
        prompt: '___ is the chemical symbol for water.',
        blanks: [{
          id: 'blank-1',
          answers: [
            { type: 'exact', value: 'H2O' },
            { type: 'regex', pattern: '^h\s*2\s*o$', flags: 'i' },
          ],
        }],
        scoring: { mode: 'all' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      id: 'fib-item-id',
      tenantId: 'tenant-1',
      kind: 'FILL_IN_THE_BLANK',
      prompt: '___ is the chemical symbol for water.',
      blanks: [{
        id: 'blank-1',
        acceptableAnswers: [
          { type: 'exact', value: 'H2O', caseSensitive: false },
          { type: 'regex', pattern: '^h\s*2\s*o$', flags: 'i' },
        ],
      }],
      scoring: { mode: 'all' },
    });
    expect(saveMock).toHaveBeenCalledWith(body);
  });

  it('rejects duplicate blank identifiers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'FILL_IN_THE_BLANK',
        prompt: '___ ___',
        blanks: [
          { id: 'dup', answers: [{ type: 'exact', value: 'foo' }] },
          { id: 'dup', answers: [{ type: 'exact', value: 'bar' }] },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Blank ids must be unique' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('returns an item when found', async () => {
    const storedItem = {
      id: 'item-123',
      tenantId: 'tenant-1',
      kind: 'MCQ' as const,
      prompt: 'Largest planet?',
      choices: [{ text: 'Earth' }, { text: 'Jupiter' }],
      answerMode: 'single' as const,
      correctIndexes: [1],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    getByIdMock.mockReturnValueOnce(storedItem);

    const response = await app.inject({ method: 'GET', url: '/items/item-123' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(storedItem);
    expect(getByIdMock).toHaveBeenCalledWith('tenant-1', 'item-123');
  });

  it('responds 404 when item is missing', async () => {
    getByIdMock.mockReturnValueOnce(undefined);

    const response = await app.inject({ method: 'GET', url: '/items/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
    expect(getByIdMock).toHaveBeenCalledWith('tenant-1', 'missing');
  });
});
