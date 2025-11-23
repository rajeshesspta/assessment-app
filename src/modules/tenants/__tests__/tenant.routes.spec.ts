import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tenantRoutes } from '../tenant.routes.js';
import { createInMemoryTenantRepository } from '../tenant.repository.js';
import type { TenantRepository } from '../tenant.repository.js';

async function buildTestApp() {
  const repository = createInMemoryTenantRepository();
  let currentTenantId = 'admin';

  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = currentTenantId;
  });

  await app.register(tenantRoutes, {
    prefix: '/tenants',
    repository,
  });

  return {
    app,
    repository,
    setTenant(id: string) {
      currentTenantId = id;
    },
  };
}

describe('tenantRoutes', () => {
  let app: FastifyInstance;
  let repository: TenantRepository;
  let setTenant: (id: string) => void;

  beforeEach(async () => {
    const testContext = await buildTestApp();
    app = testContext.app;
    repository = testContext.repository;
    setTenant = testContext.setTenant;
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a tenant when called by admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Acme Corp',
        apiKey: 'secret-api-key',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      name: 'Acme Corp',
      slug: 'acme-corp',
      status: 'active',
      apiKey: 'secret-api-key',
    });
    expect(body.createdAt).toBe(body.updatedAt);
    expect(repository.getById(body.id)).toEqual(body);
  });

  it('rejects duplicate slugs with 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Acme Corp',
        slug: 'acme',
        apiKey: 'secret-api-key',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Another Co',
        slug: 'acme',
        apiKey: 'another-secret',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'Slug already exists' });
  });

  it('forbids non-admin tenant listings', async () => {
    setTenant('tenant-123');
    const response = await app.inject({ method: 'GET', url: '/tenants' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });
});
