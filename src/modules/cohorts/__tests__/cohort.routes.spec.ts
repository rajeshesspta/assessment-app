import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cohortRoutes } from '../cohort.routes.js';
import type { Cohort } from '../../../common/types.js';

const cohortRepository = {
  save: vi.fn(),
  list: vi.fn(),
  getById: vi.fn(),
  listByLearner: vi.fn(),
  delete: vi.fn(),
};

const userRepository = {
  save: vi.fn(),
  getById: vi.fn(),
  getByEmail: vi.fn(),
  listByRole: vi.fn(),
};

const assessmentRepository = {
  save: vi.fn(),
  getById: vi.fn(),
};

let currentActorRoles: string[] = ['TENANT_ADMIN'];
let currentIsSuperAdmin = false;

async function buildTestApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
    (request as any).actorRoles = currentActorRoles;
    (request as any).isSuperAdmin = currentIsSuperAdmin;
  });
  await app.register(cohortRoutes, {
    prefix: '/cohorts',
    repository: cohortRepository,
    userRepository,
    assessmentRepository,
  });
  return app;
}

describe('cohortRoutes', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentActorRoles = ['TENANT_ADMIN'];
    currentIsSuperAdmin = false;
    cohortRepository.save.mockImplementation(cohort => cohort);
    cohortRepository.list.mockReturnValue([]);
    cohortRepository.getById.mockReturnValue(undefined);
    userRepository.getById.mockImplementation((tenantId: string, id: string) => ({
      id,
      tenantId,
      roles: ['LEARNER'],
      email: `${id}@example.com`,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    assessmentRepository.getById.mockImplementation((tenantId: string, id: string) => ({
      id,
      tenantId,
      title: `Assessment ${id}`,
      itemIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists cohorts for the current tenant', async () => {
    const cohorts: Cohort[] = [{
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Alpha',
      learnerIds: ['learner-1'],
      assessmentIds: [],
      createdAt: 'now',
      updatedAt: 'now',
    }];
    cohortRepository.list.mockReturnValueOnce(cohorts);

    const response = await app.inject({ method: 'GET', url: '/cohorts' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(cohorts);
    expect(cohortRepository.list).toHaveBeenCalledWith('tenant-1');
  });

  it('creates a cohort with learners and optional assessments', async () => {
    userRepository.getById.mockReturnValue({ id: 'learner-1', roles: ['LEARNER'] });
    assessmentRepository.getById.mockReturnValue({ id: 'assessment-1' });
    const response = await app.inject({
      method: 'POST',
      url: '/cohorts',
      payload: {
        name: 'STEM Cohort',
        description: 'Spring 2026',
        learnerIds: ['learner-1', 'learner-1', 'learner-2'],
        assessmentIds: ['assessment-1'],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      tenantId: 'tenant-1',
      name: 'STEM Cohort',
      description: 'Spring 2026',
      learnerIds: ['learner-1', 'learner-2'],
      assessmentIds: ['assessment-1'],
    });
    expect(cohortRepository.save).toHaveBeenCalled();
  });

  it('rejects cohort creation when learner is missing', async () => {
    userRepository.getById.mockReturnValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/cohorts',
      payload: {
        name: 'STEM Cohort',
        learnerIds: ['missing-learner'],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Learner missing-learner does not exist' });
    expect(cohortRepository.save).not.toHaveBeenCalled();
  });

  it('rejects cohort creation when a user is not a learner', async () => {
    userRepository.getById.mockReturnValueOnce({
      id: 'content-author',
      tenantId: 'tenant-1',
      roles: ['CONTENT_AUTHOR'],
      email: 'author@example.com',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/cohorts',
      payload: {
        name: 'Author Cohort',
        learnerIds: ['content-author'],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'User content-author is not a learner' });
    expect(cohortRepository.save).not.toHaveBeenCalled();
  });

  it('assigns additional assessments to a cohort', async () => {
    const cohort: Cohort = {
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Alpha',
      learnerIds: ['learner-1'],
      assessmentIds: ['assessment-1'],
      createdAt: 'now',
      updatedAt: 'now',
    };
    cohortRepository.getById.mockReturnValueOnce(cohort);

    const response = await app.inject({
      method: 'POST',
      url: '/cohorts/cohort-1/assessments',
      payload: { assessmentIds: ['assessment-2', 'assessment-1'] },
    });

    expect(response.statusCode).toBe(200);
    expect(cohortRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'cohort-1',
      assessmentIds: ['assessment-1', 'assessment-2'],
    }));
    expect(response.json().assessmentIds).toEqual(['assessment-1', 'assessment-2']);
  });

  it('assigns assessments to a user directly by creating a personal cohort', async () => {
    userRepository.getById.mockReturnValueOnce({ id: 'learner-1', roles: ['LEARNER'] });
    cohortRepository.listByLearner.mockReturnValueOnce([]); // No existing personal cohort

    const response = await app.inject({
      method: 'POST',
      url: '/cohorts/assignments/users/learner-1',
      payload: { assignments: [{ assessmentId: 'assessment-1' }] },
    });

    expect(response.statusCode).toBe(200);
    expect(cohortRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Personal: learner-1',
      learnerIds: ['learner-1'],
      assessmentIds: ['assessment-1'],
    }));
  });

  it('rejects assessment assignment when an assessment does not exist', async () => {
    const cohort: Cohort = {
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Alpha',
      learnerIds: ['learner-1'],
      assessmentIds: [],
      createdAt: 'now',
      updatedAt: 'now',
    };
    cohortRepository.getById.mockReturnValueOnce(cohort);
    assessmentRepository.getById.mockReturnValueOnce(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/cohorts/cohort-1/assessments',
      payload: { assignments: [{ assessmentId: 'missing-assessment' }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Assessment missing-assessment does not exist' });
    expect(cohortRepository.save).not.toHaveBeenCalled();
  });

  it('rejects callers without cohort manager roles', async () => {
    currentActorRoles = ['LEARNER'];

    const response = await app.inject({ method: 'GET', url: '/cohorts' });

    expect(response.statusCode).toBe(403);
    expect(cohortRepository.list).not.toHaveBeenCalled();
  });

  it('persists availableFrom and dueDate when assigning assessments', async () => {
    const cohort: Cohort = {
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Alpha',
      learnerIds: ['learner-1'],
      assessmentIds: [],
      createdAt: 'now',
      updatedAt: 'now',
    };
    cohortRepository.getById.mockReturnValueOnce(cohort);
    assessmentRepository.getById.mockReturnValueOnce({ id: 'assessment-1' });

    const availableFrom = '2025-01-01T09:00:00Z';
    const dueDate = '2025-01-02T17:00:00Z';

    const response = await app.inject({
      method: 'POST',
      url: '/cohorts/cohort-1/assessments',
      payload: {
        assignments: [
          {
            assessmentId: 'assessment-1',
            availableFrom,
            dueDate,
            allowedAttempts: 2,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(cohortRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      assignments: [
        {
          assessmentId: 'assessment-1',
          availableFrom,
          dueDate,
          allowedAttempts: 2,
        },
      ],
    }));
  });

  it('rejects super admins even when tenant roles are provided', async () => {
    currentActorRoles = ['TENANT_ADMIN'];
    currentIsSuperAdmin = true;

    const response = await app.inject({ method: 'GET', url: '/cohorts' });

    expect(response.statusCode).toBe(403);
    expect(cohortRepository.list).not.toHaveBeenCalled();
  });

  it('updates a cohort', async () => {
    const cohort: Cohort = {
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Alpha',
      learnerIds: ['learner-1'],
      assessmentIds: [],
      createdAt: 'now',
      updatedAt: 'now',
    };
    cohortRepository.getById.mockReturnValueOnce(cohort);

    const response = await app.inject({
      method: 'PUT',
      url: '/cohorts/cohort-1',
      payload: { name: 'Beta' },
    });

    expect(response.statusCode).toBe(200);
    expect(cohortRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'cohort-1',
      name: 'Beta',
    }));
  });

  it('persists availableFrom and dueDate when updating cohort assignments', async () => {
    const cohort: Cohort = {
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Alpha',
      learnerIds: ['learner-1'],
      assessmentIds: [],
      createdAt: 'now',
      updatedAt: 'now',
    };
    cohortRepository.getById.mockReturnValueOnce(cohort);
    userRepository.getById.mockReturnValue({ id: 'learner-1', roles: ['LEARNER'] });
    assessmentRepository.getById.mockReturnValue({ id: 'assessment-1' });

    const availableFrom = '2025-01-01T09:00:00Z';
    const dueDate = '2025-01-02T17:00:00Z';

    const response = await app.inject({
      method: 'PUT',
      url: '/cohorts/cohort-1',
      payload: {
        name: 'Beta',
        learnerIds: ['learner-1'],
        assignments: [
          {
            assessmentId: 'assessment-1',
            availableFrom,
            dueDate,
            allowedAttempts: 2,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(cohortRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      assignments: [
        {
          assessmentId: 'assessment-1',
          availableFrom,
          dueDate,
          allowedAttempts: 2,
        },
      ],
    }));
  });

  it('returns 404 when updating missing cohort', async () => {
    cohortRepository.getById.mockReturnValueOnce(undefined);

    const response = await app.inject({
      method: 'PUT',
      url: '/cohorts/missing',
      payload: { name: 'Beta' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Cohort not found' });
  });

  it('deletes a cohort', async () => {
    const cohort: Cohort = {
      id: 'cohort-1',
      tenantId: 'tenant-1',
      name: 'Alpha',
      learnerIds: ['learner-1'],
      assessmentIds: [],
      createdAt: 'now',
      updatedAt: 'now',
    };
    cohortRepository.getById.mockReturnValueOnce(cohort);

    const response = await app.inject({
      method: 'DELETE',
      url: '/cohorts/cohort-1',
    });

    expect(response.statusCode).toBe(204);
    expect(cohortRepository.delete).toHaveBeenCalledWith('tenant-1', 'cohort-1');
  });

  it('returns 404 when deleting missing cohort', async () => {
    cohortRepository.getById.mockReturnValueOnce(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: '/cohorts/missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Cohort not found' });
  });
});
