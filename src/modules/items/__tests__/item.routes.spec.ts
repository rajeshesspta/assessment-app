import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveMock, getByIdMock, publishMock, uuidMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  getByIdMock: vi.fn(),
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
    },
  });
  return app;
}

describe('itemRoutes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    saveMock.mockImplementation(entity => entity);
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an item when payload is valid', async () => {
    uuidMock.mockReturnValueOnce('item-id-1').mockReturnValueOnce('event-id-1');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        prompt: 'What is 2 + 2?',
        choices: [{ text: '3' }, { text: '4' }],
        correctIndex: 1,
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
      correctIndex: 1,
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

  it('rejects items where correctIndex is out of range', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        prompt: 'Capital of France?',
        choices: [{ text: 'Paris' }, { text: 'Berlin' }],
        correctIndex: 5,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'correctIndex out of range' });
    expect(saveMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('returns an item when found', async () => {
    const storedItem = {
      id: 'item-123',
      tenantId: 'tenant-1',
      kind: 'MCQ' as const,
      prompt: 'Largest planet?',
      choices: [{ text: 'Earth' }, { text: 'Jupiter' }],
      correctIndex: 1,
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
