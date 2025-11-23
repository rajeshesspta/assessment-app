import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';

const mocks = vi.hoisted(() => ({
  registerAuth: vi.fn(async (_req: FastifyRequest, _reply: FastifyReply) => {}),
  itemRoutes: vi.fn(async (app: FastifyInstance) => { app.get('/items/mock', async () => ({ ok: true })); }),
  assessmentRoutes: vi.fn(async (app: FastifyInstance) => { app.get('/assessments/mock', async () => ({ ok: true })); }),
  attemptRoutes: vi.fn(async (app: FastifyInstance) => { app.get('/attempts/mock', async () => ({ ok: true })); }),
  analyticsRoutes: vi.fn(async (app: FastifyInstance) => { app.get('/analytics/mock', async () => ({ ok: true })); }),
}));

vi.mock('../modules/auth/auth.middleware.js', () => ({
  registerAuth: (req: FastifyRequest, reply: FastifyReply) => mocks.registerAuth(req, reply),
}));

vi.mock('../modules/items/item.routes.js', () => ({
  itemRoutes: (app: FastifyInstance) => mocks.itemRoutes(app),
}));

vi.mock('../modules/assessments/assessment.routes.js', () => ({
  assessmentRoutes: (app: FastifyInstance) => mocks.assessmentRoutes(app),
}));

vi.mock('../modules/attempts/attempt.routes.js', () => ({
  attemptRoutes: (app: FastifyInstance) => mocks.attemptRoutes(app),
}));

vi.mock('../modules/analytics/analytics.routes.js', () => ({
  analyticsRoutes: (app: FastifyInstance) => mocks.analyticsRoutes(app),
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
    expect(mocks.registerAuth).toHaveBeenCalled();
    expect(mocks.itemRoutes).toHaveBeenCalled();
    expect(mocks.assessmentRoutes).toHaveBeenCalled();
    expect(mocks.attemptRoutes).toHaveBeenCalled();
    expect(mocks.analyticsRoutes).toHaveBeenCalled();
  });
});
