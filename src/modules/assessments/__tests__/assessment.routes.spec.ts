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

import { assessmentRoutes } from '../assessment.routes.js';

let currentActorRoles: string[] = ['TENANT_ADMIN'];
let currentIsSuperAdmin = false;

async function buildTestApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
    (request as any).actorRoles = currentActorRoles;
    (request as any).isSuperAdmin = currentIsSuperAdmin;
  });
  await app.register(assessmentRoutes, {
    prefix: '/assessments',
    repository: {
      save: saveMock,
      getById: getByIdMock,
    },
  });
  return app;
}

describe('assessmentRoutes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentActorRoles = ['TENANT_ADMIN'];
    currentIsSuperAdmin = false;
    saveMock.mockImplementation(entity => entity);
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an assessment and emits event', async () => {
    uuidMock.mockReturnValueOnce('assessment-id-1').mockReturnValueOnce('event-id-1');
    const response = await app.inject({
      method: 'POST',
      url: '/assessments',
      payload: {
        title: 'Sample Assessment',
        itemIds: ['item-1', 'item-2'],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: 'assessment-id-1',
      tenantId: 'tenant-1',
      title: 'Sample Assessment',
      itemIds: ['item-1', 'item-2'],
      allowedAttempts: 1,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(body.createdAt).toBe(body.updatedAt);
    expect(saveMock).toHaveBeenCalledWith(body);
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'AssessmentCreated',
      tenantId: 'tenant-1',
      payload: { assessmentId: 'assessment-id-1' },
    }));
  });

  it('accepts custom allowedAttempts values', async () => {
    uuidMock.mockReturnValueOnce('assessment-id-2').mockReturnValueOnce('event-id-2');
    const response = await app.inject({
      method: 'POST',
      url: '/assessments',
      payload: {
        title: 'Attempt-limited Assessment',
        itemIds: ['item-1'],
        allowedAttempts: 4,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ allowedAttempts: 4 });
  });

  it('returns assessment when found', async () => {
    const existing = {
      id: 'assessment-1',
      tenantId: 'tenant-1',
      title: 'Existing',
      itemIds: ['item-1'],
      allowedAttempts: 3,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    getByIdMock.mockReturnValueOnce(existing);

    const response = await app.inject({ method: 'GET', url: '/assessments/assessment-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(existing);
    expect(getByIdMock).toHaveBeenCalledWith('tenant-1', 'assessment-1');
  });

  it('returns 404 when assessment missing', async () => {
    getByIdMock.mockReturnValueOnce(undefined);

    const response = await app.inject({ method: 'GET', url: '/assessments/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
    expect(getByIdMock).toHaveBeenCalledWith('tenant-1', 'missing');
  });

  it('rejects super admin callers', async () => {
    currentIsSuperAdmin = true;
    const response = await app.inject({
      method: 'POST',
      url: '/assessments',
      payload: { title: 'Blocked', itemIds: ['item-1'] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });
});
