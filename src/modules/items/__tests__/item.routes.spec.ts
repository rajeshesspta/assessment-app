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
    expect(listMock).toHaveBeenCalledWith('tenant-1', { search: undefined, kind: undefined, limit: 10, offset: 0 });
  });

  it('lists items filtered by search query with paging', async () => {
    const results = [{ id: '2' }] as any;
    listMock.mockReturnValueOnce(results);

    const response = await app.inject({ method: 'GET', url: '/items?search=math&limit=5&offset=10' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(results);
    expect(listMock).toHaveBeenCalledWith('tenant-1', { search: 'math', kind: undefined, limit: 5, offset: 10 });
  });

  it('lists items filtered by kind', async () => {
    const results = [{ id: '3' }] as any;
    listMock.mockReturnValueOnce(results);

    const response = await app.inject({ method: 'GET', url: '/items?kind=TRUE_FALSE' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(results);
    expect(listMock).toHaveBeenCalledWith('tenant-1', { search: undefined, kind: 'TRUE_FALSE', limit: 10, offset: 0 });
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

  it('creates an ordering item with validation', async () => {
    uuidMock.mockReturnValueOnce('ordering-item-id').mockReturnValueOnce('event-id-4');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'ORDERING',
        prompt: 'Rank the phases',
        options: [
          { id: 'opt-1', text: 'Plan' },
          { id: 'opt-2', text: 'Execute' },
          { id: 'opt-3', text: 'Review' },
        ],
        correctOrder: ['opt-1', 'opt-2', 'opt-3'],
        scoring: { mode: 'partial_pairs' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      id: 'ordering-item-id',
      tenantId: 'tenant-1',
      kind: 'ORDERING',
      prompt: 'Rank the phases',
      options: [
        { id: 'opt-1', text: 'Plan' },
        { id: 'opt-2', text: 'Execute' },
        { id: 'opt-3', text: 'Review' },
      ],
      correctOrder: ['opt-1', 'opt-2', 'opt-3'],
      scoring: { mode: 'partial_pairs' },
    });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ORDERING' }));
  });

  it('creates a short-answer item and deduplicates keywords', async () => {
    uuidMock.mockReturnValueOnce('sa-item-id').mockReturnValueOnce('event-id-5');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'SHORT_ANSWER',
        prompt: 'Explain gravity.',
        rubric: {
          keywords: [' gravity ', 'mass', 'gravity'],
          guidance: 'Mention mass and attraction.',
        },
        scoring: { mode: 'ai_rubric', maxScore: 4, aiEvaluatorId: 'azure-ai' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'sa-item-id',
      tenantId: 'tenant-1',
      kind: 'SHORT_ANSWER',
      rubric: { keywords: ['gravity', 'mass'], guidance: 'Mention mass and attraction.' },
      scoring: { mode: 'ai_rubric', maxScore: 4, aiEvaluatorId: 'azure-ai' },
    });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'SHORT_ANSWER' }));
  });

  it('requires aiEvaluatorId when ai_rubric mode selected', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'SHORT_ANSWER',
        prompt: 'Explain gravity.',
        scoring: { mode: 'ai_rubric', maxScore: 3 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('creates an essay item with rubric sections and length guidance', async () => {
    uuidMock.mockReturnValueOnce('essay-item-id').mockReturnValueOnce('event-id-6');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'ESSAY',
        prompt: 'Discuss AI ethics.',
        length: { minWords: 300, maxWords: 800, recommendedWords: 500 },
        rubric: {
          keywords: ['ethics', 'privacy', 'ethics'],
          guidance: 'Address privacy and fairness.',
          sections: [
            { id: 'intro', title: 'Introduction', maxScore: 3, keywords: ['intro', 'hook', 'intro'] },
            { id: 'analysis', title: 'Analysis', maxScore: 5 },
          ],
        },
        scoring: { mode: 'manual', maxScore: 10 },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'essay-item-id',
      kind: 'ESSAY',
      length: { minWords: 300, maxWords: 800, recommendedWords: 500 },
      rubric: {
        keywords: ['ethics', 'privacy'],
        sections: [
          { id: 'intro', title: 'Introduction', maxScore: 3, keywords: ['intro', 'hook'] },
          { id: 'analysis', title: 'Analysis', maxScore: 5 },
        ],
      },
    });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ESSAY' }));
  });

  it('rejects essay payloads with invalid word bounds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'ESSAY',
        prompt: 'Discuss AI ethics.',
        length: { minWords: 900, maxWords: 500 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('requires aiEvaluatorId for essay ai_rubric mode', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'ESSAY',
        prompt: 'Discuss AI ethics.',
        scoring: { mode: 'ai_rubric', maxScore: 12 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('creates a numeric entry item with tolerance metadata', async () => {
    uuidMock.mockReturnValueOnce('numeric-item-id').mockReturnValueOnce('event-id-7');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'NUMERIC_ENTRY',
        prompt: 'Report gravity in m/s^2',
        validation: { mode: 'exact', value: 9.81, tolerance: 0.05 },
        units: { label: 'Meters per second squared', symbol: 'm/s^2', precision: 2 },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'numeric-item-id',
      kind: 'NUMERIC_ENTRY',
      validation: { mode: 'exact', value: 9.81, tolerance: 0.05 },
      units: { label: 'Meters per second squared', symbol: 'm/s^2', precision: 2 },
    });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'NUMERIC_ENTRY' }));
  });

  it('creates a hotspot item with polygon metadata', async () => {
    uuidMock.mockReturnValueOnce('hotspot-item-id').mockReturnValueOnce('event-id-8');

    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'HOTSPOT',
        prompt: 'Identify the two highlighted regions.',
        image: { url: 'https://example.com/map.png', width: 800, height: 600, alt: ' Map  ' },
        hotspots: [
          { id: 'region-a', label: 'Region A', points: [{ x: 0.1, y: 0.2 }, { x: 0.25, y: 0.2 }, { x: 0.18, y: 0.35 }] },
          { id: 'region-b', points: [{ x: 0.6, y: 0.1 }, { x: 0.75, y: 0.1 }, { x: 0.68, y: 0.28 }] },
        ],
        scoring: { mode: 'partial', maxSelections: 2 },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'hotspot-item-id',
      kind: 'HOTSPOT',
      image: { alt: 'Map' },
      hotspots: expect.arrayContaining([
        expect.objectContaining({ id: 'region-a', points: expect.any(Array) }),
      ]),
      scoring: { mode: 'partial', maxSelections: 2 },
    });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'HOTSPOT' }));
  });

  it('rejects numeric entry payloads when range bounds are invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'NUMERIC_ENTRY',
        prompt: 'Provide current temperature',
        validation: { mode: 'range', min: 100, max: 50 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('rejects hotspot payloads when selection settings are invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/items',
      payload: {
        kind: 'HOTSPOT',
        prompt: 'Find the areas',
        image: { url: 'https://example.com/map.png', width: 800, height: 600 },
        hotspots: [
          { id: 'region-a', points: [{ x: 0.1, y: 0.2 }, { x: 0.25, y: 0.2 }, { x: 0.18, y: 0.35 }] },
          { id: 'region-b', points: [{ x: 0.6, y: 0.1 }, { x: 0.75, y: 0.1 }, { x: 0.68, y: 0.28 }] },
        ],
        scoring: { mode: 'all', maxSelections: 1 },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'maxSelections must allow selecting every hotspot' });
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
