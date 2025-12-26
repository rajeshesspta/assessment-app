import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTenantConfig } from '../testing/test-utils';

const BASE_ENV = {
  PORT: '0',
  HOST: '127.0.0.1',
  SESSION_SECRET: 'test-session-secret-123456789012345',
};

async function setupServer(tenants = [createTenantConfig()], extraEnv: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(BASE_ENV)) {
    process.env[key] = value;
  }
  delete process.env.TENANT_CONFIG_PATH;
  delete process.env.CONTROL_PLANE_BASE_URL;
  delete process.env.CONTROL_PLANE_API_KEY;
  delete process.env.CONTROL_PLANE_BUNDLE_PATH;
  delete process.env.TENANT_CONFIG_REFRESH_MS;
  process.env.DEFAULT_TENANT_ID = '';
  process.env.TENANT_CONFIG_JSON = JSON.stringify({ version: 'test', tenants });
  Object.assign(process.env, extraEnv);

  const { app } = await import('../server');
  await app.ready();
  return app as FastifyInstance;
}

async function teardownServer(app?: FastifyInstance) {
  if (!app) {
    return;
  }
  await app.close();
  delete process.env.TENANT_CONFIG_JSON;
  delete process.env.DEFAULT_TENANT_ID;
  delete process.env.CONTROL_PLANE_BASE_URL;
  delete process.env.CONTROL_PLANE_API_KEY;
}

describe('server routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await teardownServer(app);
    app = undefined;
    vi.restoreAllMocks();
  });

  it('returns tenant config payload for resolved host', async () => {
    const tenant = createTenantConfig({
      hosts: ['tenant.test'],
      supportEmail: 'help@tenant.test',
      branding: { primaryColor: '#112233' },
      featureFlags: { analytics: true },
    });
    app = await setupServer([tenant]);

    const response = await app.inject({
      method: 'GET',
      url: '/config',
      headers: { host: 'tenant.test' },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload).toMatchObject({
      tenantId: tenant.tenantId,
      name: tenant.name,
      supportEmail: 'help@tenant.test',
      branding: { primaryColor: '#112233' },
      featureFlags: { analytics: true },
    });
  });

  it('rejects requests without host mapping when fallback unavailable', async () => {
    const tenants = [
      createTenantConfig({ hosts: ['alpha.test'] }),
      createTenantConfig({ tenantId: 'tenant-beta', hosts: ['beta.test'] }),
    ];
    app = await setupServer(tenants);

    const response = await app.inject({ method: 'GET', url: '/config' });
    expect(response.statusCode).toBe(404);
  });

  it('forwards analytics requests to headless API with tenant headers', async () => {
    const tenant = createTenantConfig({ hosts: ['tenant.test'] });
    app = await setupServer([tenant]);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'analytics-123' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const response = await app.inject({
      method: 'GET',
      url: '/api/analytics/assessments/analytics-123',
      headers: {
        host: 'tenant.test',
        'x-actor-roles': 'TENANT_ADMIN',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'analytics-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg, initArg] = fetchMock.mock.calls[0];
    expect(String(urlArg)).toContain('/analytics/assessments/analytics-123');
    expect(initArg?.headers).toMatchObject({
      'x-api-key': tenant.headless.apiKey,
      'x-tenant-id': tenant.headless.tenantId,
      'x-actor-roles': 'TENANT_ADMIN',
    });
  });

  it('forwards cohort delete requests to headless API', async () => {
    const tenant = createTenantConfig({ hosts: ['tenant.test'] });
    app = await setupServer([tenant]);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/cohorts/cohort-123',
      headers: { host: 'tenant.test' },
    });

    expect(response.statusCode).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg, initArg] = fetchMock.mock.calls[0];
    expect(String(urlArg)).toContain('/cohorts/cohort-123');
    expect(initArg?.method).toBe('DELETE');
    expect(initArg?.headers).toMatchObject({
      'x-api-key': tenant.headless.apiKey,
      'x-tenant-id': tenant.headless.tenantId,
    });
  });

  it('returns 401 for /auth/session when no cookie is present', async () => {
    app = await setupServer();
    const response = await app.inject({
      method: 'GET',
      url: '/auth/session',
    });
    expect(response.statusCode).toBe(401);
  });

  it('redirects to google for /auth/google/login', async () => {
    const tenant = createTenantConfig({ hosts: ['tenant.test'] });
    app = await setupServer([tenant]);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/google/login',
      headers: { host: 'tenant.test' },
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    expect(response.headers.location).toContain('client_id=' + tenant.auth.google.clientId);
  });

  it('clears cookie on /auth/logout', async () => {
    app = await setupServer();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(response.statusCode).toBe(200);
    const cookies = response.cookies;
    const sessionCookie = cookies.find(c => c.name === 'consumer_portal_session');
    expect(sessionCookie?.value).toBe('');
  });

  it('forwards item bank requests to headless API', async () => {
    const tenant = createTenantConfig({ hosts: ['tenant.test'] });
    app = await setupServer([tenant]);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([{ id: 'item-1', prompt: 'Test Item' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const response = await app.inject({
      method: 'GET',
      url: '/api/items',
      query: { kind: 'MCQ' },
      headers: {
        host: 'tenant.test',
        'x-actor-roles': 'CONTENT_AUTHOR',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 'item-1', prompt: 'Test Item' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg, initArg] = fetchMock.mock.calls[0];
    expect(String(urlArg)).toContain('/items?kind=MCQ');
    expect(initArg?.headers).toMatchObject({
      'x-api-key': tenant.headless.apiKey,
      'x-tenant-id': tenant.headless.tenantId,
      'x-actor-roles': 'CONTENT_AUTHOR',
    });
  });
});
