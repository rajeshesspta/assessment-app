import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveMock, getByIdMock, listMock, publishMock, uuidMock, listByLearnerMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  getByIdMock: vi.fn(),
  listMock: vi.fn(),
  publishMock: vi.fn(),
  uuidMock: vi.fn(),
  listByLearnerMock: vi.fn(),
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
let currentUserId = 'user-1';

async function buildTestApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
    (request as any).actorRoles = currentActorRoles;
    (request as any).isSuperAdmin = currentIsSuperAdmin;
    (request as any).userId = currentUserId;
  });
  await app.register(assessmentRoutes, {
    prefix: '/assessments',
    repository: {
      save: saveMock,
      getById: getByIdMock,
      list: listMock,
    },
    cohortRepository: {
      listByLearner: listByLearnerMock,
    } as any,
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

  it('lists assessments for the tenant', async () => {
    const mockAssessments = [
      { id: 'a1', title: 'A1', tenantId: 'tenant-1' },
      { id: 'a2', title: 'A2', tenantId: 'tenant-1' },
    ];
    listMock.mockReturnValue(mockAssessments);

    const response = await app.inject({
      method: 'GET',
      url: '/assessments',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(mockAssessments);
    expect(listMock).toHaveBeenCalledWith('tenant-1');
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
  it('accepts description and timeLimitMinutes', async () => {
    uuidMock.mockReturnValueOnce('assessment-id-3').mockReturnValueOnce('event-id-3');
    const response = await app.inject({
      method: 'POST',
      url: '/assessments',
      payload: {
        title: 'Timed Assessment',
        description: 'This is a timed test',
        itemIds: ['item-1'],
        timeLimitMinutes: 60,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.description).toBe('This is a timed test');
    expect(body.timeLimitMinutes).toBe(60);
  });

  it('updates an assessment', async () => {
    const existing = {
      id: 'a1',
      tenantId: 'tenant-1',
      title: 'Old Title',
      itemIds: ['i1'],
      allowedAttempts: 1,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };
    getByIdMock.mockReturnValue(existing);
    uuidMock.mockReturnValue('event-id-update');

    const response = await app.inject({
      method: 'PUT',
      url: '/assessments/a1',
      payload: {
        title: 'New Title',
        itemIds: ['i1', 'i2'],
        allowedAttempts: 2,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe('New Title');
    expect(body.itemIds).toEqual(['i1', 'i2']);
    expect(body.allowedAttempts).toBe(2);
    expect(body.updatedAt).not.toBe(existing.updatedAt);
    expect(saveMock).toHaveBeenCalled();
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'AssessmentUpdated',
      payload: { assessmentId: 'a1' },
    }));
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

  it('allows learner to access assigned assessment', async () => {
    currentActorRoles = ['LEARNER'];
    currentUserId = 'learner-1';
    const assessment = { id: 'a1', title: 'A1', tenantId: 'tenant-1', itemIds: ['i1'] };
    getByIdMock.mockReturnValue(assessment);
    listByLearnerMock.mockReturnValue([{
      id: 'c1',
      assessmentIds: ['a1'],
    }]);

    const response = await app.inject({
      method: 'GET',
      url: '/assessments/a1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(assessment);
  });

  it('denies learner access to unassigned assessment', async () => {
    currentActorRoles = ['LEARNER'];
    currentUserId = 'learner-1';
    const assessment = { id: 'a2', title: 'A2', tenantId: 'tenant-1', itemIds: ['i1'] };
    getByIdMock.mockReturnValue(assessment);
    listByLearnerMock.mockReturnValue([{
      id: 'c1',
      assessmentIds: ['a1'],
    }]);

    const response = await app.inject({
      method: 'GET',
      url: '/assessments/a2',
    });

    expect(response.statusCode).toBe(403);
  });
});
