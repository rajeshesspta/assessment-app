import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';

const mocks = vi.hoisted(() => ({
  registerAuth: vi.fn(async (_req: FastifyRequest, _reply: FastifyReply) => {}),
  itemRoutes: vi.fn(async (app: FastifyInstance, _opts?: unknown) => {
    app.get('/mock', async () => ({ ok: true }));
  }),
  assessmentRoutes: vi.fn(async (app: FastifyInstance, _opts?: unknown) => {
    app.get('/mock', async () => ({ ok: true }));
  }),
  attemptRoutes: vi.fn(async (app: FastifyInstance, _opts?: unknown) => {
    app.get('/mock', async () => ({ ok: true }));
  }),
  analyticsRoutes: vi.fn(async (app: FastifyInstance, _opts?: unknown) => {
    app.get('/mock', async () => ({ ok: true }));
  }),
  cohortRoutes: vi.fn(async (app: FastifyInstance, _opts?: unknown) => {
    app.get('/mock', async () => ({ ok: true }));
  }),
}));

vi.mock('../modules/auth/auth.middleware.js', () => ({
  registerAuth: (req: FastifyRequest, reply: FastifyReply) => mocks.registerAuth(req, reply),
}));

vi.mock('../modules/items/item.routes.js', () => ({
  itemRoutes: (app: FastifyInstance, opts: unknown) => mocks.itemRoutes(app, opts),
}));

vi.mock('../modules/assessments/assessment.routes.js', () => ({
  assessmentRoutes: (app: FastifyInstance, opts: unknown) => mocks.assessmentRoutes(app, opts),
}));

vi.mock('../modules/attempts/attempt.routes.js', () => ({
  attemptRoutes: (app: FastifyInstance, opts: unknown) => mocks.attemptRoutes(app, opts),
}));

vi.mock('../modules/analytics/analytics.routes.js', () => ({
  analyticsRoutes: (app: FastifyInstance, opts: unknown) => mocks.analyticsRoutes(app, opts),
}));

vi.mock('../modules/cohorts/cohort.routes.js', () => ({
  cohortRoutes: (app: FastifyInstance, opts: unknown) => mocks.cohortRoutes(app, opts),
}));

import { buildApp } from '../app.js';

describe('buildApp', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('registers core plugins and exposes health endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    const secured = await app.inject({
      method: 'GET',
      url: '/items/mock',
      headers: {
        'x-api-key': 'test',
        'x-tenant-id': 'tenant-1',
      },
    });
    expect(secured.statusCode).toBe(200);
    expect(mocks.registerAuth).toHaveBeenCalled();
    expect(mocks.itemRoutes).toHaveBeenCalled();
    expect(mocks.assessmentRoutes).toHaveBeenCalled();
    expect(mocks.attemptRoutes).toHaveBeenCalled();
    expect(mocks.analyticsRoutes).toHaveBeenCalled();
    expect(mocks.cohortRoutes).toHaveBeenCalled();

    const [, itemOptions] = mocks.itemRoutes.mock.calls[0];
    expect(itemOptions).toMatchObject({ repository: expect.any(Object) });

    const [, assessmentOptions] = mocks.assessmentRoutes.mock.calls[0];
    expect(assessmentOptions).toMatchObject({ repository: expect.any(Object) });

    const [, attemptOptions] = mocks.attemptRoutes.mock.calls[0];
    expect(attemptOptions).toMatchObject({
      attemptRepository: expect.any(Object),
      assessmentRepository: expect.any(Object),
      itemRepository: expect.any(Object),
      userRepository: expect.any(Object),
      cohortRepository: expect.any(Object),
    });

    const [, analyticsOptions] = mocks.analyticsRoutes.mock.calls[0];
    expect(analyticsOptions).toMatchObject({ attemptRepository: expect.any(Object) });

    const [, cohortOptions] = mocks.cohortRoutes.mock.calls[0];
    expect(cohortOptions).toMatchObject({ repository: expect.any(Object), userRepository: expect.any(Object), assessmentRepository: expect.any(Object) });
  });
});
