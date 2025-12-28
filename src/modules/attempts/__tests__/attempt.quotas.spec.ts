import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { attemptRoutes } from '../attempt.routes.js';
import type { AttemptRepository } from '../attempt.repository.js';
import type { AssessmentRepository } from '../../assessments/assessment.repository.js';
import type { ItemRepository } from '../../items/item.repository.js';
import type { CohortRepository } from '../../cohorts/cohort.repository.js';
import type { UserRepository } from '../../users/user.repository.js';

describe('Attempt Quotas', () => {
  const mocks = {
    attemptRepository: {
      listByLearner: vi.fn(),
      save: vi.fn(),
      getById: vi.fn(),
    } as unknown as AttemptRepository,
    assessmentRepository: {
      getById: vi.fn(),
    } as unknown as AssessmentRepository,
    itemRepository: {
      getById: vi.fn(),
    } as unknown as ItemRepository,
    cohortRepository: {
      listByLearner: vi.fn(),
    } as unknown as CohortRepository,
    userRepository: {
      getById: vi.fn(),
    } as unknown as UserRepository,
  };

  const app = Fastify();
  app.decorateRequest('tenantId', 'tenant-1');
  app.decorateRequest('actorRoles', ['LEARNER']);
  app.register(attemptRoutes, {
    attemptRepository: mocks.attemptRepository,
    assessmentRepository: mocks.assessmentRepository,
    itemRepository: mocks.itemRepository,
    cohortRepository: mocks.cohortRepository,
    userRepository: mocks.userRepository,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('respects allowedAttempts override in cohort assignment', async () => {
    mocks.userRepository.getById = vi.fn().mockReturnValue({ id: 'learner-1', roles: ['LEARNER'] });
    mocks.assessmentRepository.getById = vi.fn().mockReturnValue({ id: 'assessment-1', allowedAttempts: 1, itemIds: [] });
    mocks.cohortRepository.listByLearner = vi.fn().mockReturnValue([
      {
        id: 'cohort-1',
        assessmentIds: ['assessment-1'],
        assignments: [{ assessmentId: 'assessment-1', allowedAttempts: 3 }],
      },
    ]);
    mocks.attemptRepository.listByLearner = vi.fn().mockReturnValue([{}, {}]); // 2 existing attempts

    const response = await app.inject({
      method: 'POST',
      url: '/',
      body: { assessmentId: 'assessment-1', userId: 'learner-1' },
    });

    expect(response.statusCode).toBe(201); // Should allow 3rd attempt
  });

  it('blocks attempt when override limit is reached', async () => {
    mocks.userRepository.getById = vi.fn().mockReturnValue({ id: 'learner-1', roles: ['LEARNER'] });
    mocks.assessmentRepository.getById = vi.fn().mockReturnValue({ id: 'assessment-1', allowedAttempts: 1, itemIds: [] });
    mocks.cohortRepository.listByLearner = vi.fn().mockReturnValue([
      {
        id: 'cohort-1',
        assessmentIds: ['assessment-1'],
        assignments: [{ assessmentId: 'assessment-1', allowedAttempts: 2 }],
      },
    ]);
    mocks.attemptRepository.listByLearner = vi.fn().mockReturnValue([{}, {}]); // 2 existing attempts

    const response = await app.inject({
      method: 'POST',
      url: '/',
      body: { assessmentId: 'assessment-1', userId: 'learner-1' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'Attempt limit reached' });
  });

  it('rejects attempt when learner is not assigned to the assessment', async () => {
    mocks.userRepository.getById = vi.fn().mockReturnValue({ id: 'learner-1', roles: ['LEARNER'] });
    mocks.assessmentRepository.getById = vi.fn().mockReturnValue({ id: 'assessment-1', allowedAttempts: 1, itemIds: [] });
    mocks.cohortRepository.listByLearner = vi.fn().mockReturnValue([
      {
        id: 'cohort-1',
        assessmentIds: ['assessment-2'], // Different assessment
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/',
      body: { assessmentId: 'assessment-1', userId: 'learner-1' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'Learner is not assigned to this assessment' });
  });

  it('rejects attempt when user is not a learner', async () => {
    mocks.userRepository.getById = vi.fn().mockReturnValue({ id: 'author-1', roles: ['CONTENT_AUTHOR'] });
    mocks.assessmentRepository.getById = vi.fn().mockReturnValue({ id: 'assessment-1', itemIds: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/',
      body: { assessmentId: 'assessment-1', userId: 'author-1' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'User is not a learner' });
  });
});
