import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tenantRoutes } from '../tenant.routes.js';
import { createInMemoryTenantRepository } from '../tenant.repository.js';
import type { TenantRepository } from '../tenant.repository.js';
import { createInMemoryUserRepository } from '../../users/user.repository.js';
import type { UserRepository } from '../../users/user.repository.js';
import { loadConfig } from '../../../config/index.js';

const superAdminTenantId = loadConfig().auth.superAdminTenantId;

async function buildTestApp() {
  const repository = createInMemoryTenantRepository();
  const userRepository = createInMemoryUserRepository();
  let currentTenantId = superAdminTenantId;
  let currentIsSuperAdmin = true;

  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = currentTenantId;
    (request as any).actorTenantId = currentIsSuperAdmin ? superAdminTenantId : currentTenantId;
    (request as any).isSuperAdmin = currentIsSuperAdmin;
  });

  await app.register(tenantRoutes, {
    prefix: '/tenants',
    repository,
    userRepository,
  });

  return {
    app,
    repository,
    userRepository,
    setTenant(id: string) {
      currentTenantId = id;
      currentIsSuperAdmin = false;
    },
    setSuperAdminTarget(id: string) {
      currentTenantId = id;
      currentIsSuperAdmin = true;
    },
  };
}

describe('tenantRoutes', () => {
    it('exposes taxonomy config for a tenant', async () => {
      // Mock taxonomy config loader
      vi.doMock('../../../config/tenant-taxonomy.js', () => ({
        getTenantTaxonomyConfig: vi.fn(async (tenantId) => ({
          categories: ['math', 'science'],
          tags: ['easy', 'hard'],
          metadataFields: [
            { key: 'difficulty', type: 'enum', allowedValues: ['easy', 'hard'], required: true, label: 'Difficulty' },
          ],
        })),
      }));
      const response = await app.inject({ method: 'GET', url: '/tenants/some-tenant/taxonomy' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        categories: expect.arrayContaining(['math', 'science']),
        tags: expect.arrayContaining(['easy', 'hard']),
        metadataFields: expect.any(Array),
      });
    });

    it('returns 404 if taxonomy config missing', async () => {
      vi.doMock('../../../config/tenant-taxonomy.js', () => ({
        getTenantTaxonomyConfig: vi.fn(async () => undefined),
      }));
      const response = await app.inject({ method: 'GET', url: '/tenants/unknown/taxonomy' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'No taxonomy config for tenant' });
    });
  let app: FastifyInstance;
  let repository: TenantRepository;
  let userRepository: UserRepository;
  let setTenant: (id: string) => void;
  let setSuperAdminTarget: (id: string) => void;

  beforeEach(async () => {
    const testContext = await buildTestApp();
    app = testContext.app;
    repository = testContext.repository;
    userRepository = testContext.userRepository;
    setTenant = testContext.setTenant;
    setSuperAdminTarget = testContext.setSuperAdminTarget;
    setSuperAdminTarget(superAdminTenantId);
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
        contactEmail: 'ops@acme.example',
        apiKey: 'secret-api-key',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      name: 'Acme Corp',
      slug: 'acme-corp',
      status: 'active',
      contactEmail: 'ops@acme.example',
      apiKey: 'secret-api-key',
    });
    expect(body.createdAt).toBe(body.updatedAt);
    expect(repository.getById(body.id)).toEqual(body);
  });

  it('rejects tenant creation without contact email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Email-less Corp',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'Validation error',
      details: expect.arrayContaining([expect.stringContaining('contactEmail')]),
    });
  });

  it('generates an API key if not provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'No Key Corp',
        contactEmail: 'ops@nokey.example',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('No Key Corp');
    expect(body.apiKey).toMatch(/^[a-f0-9]{48}$/);
  });

  it('rejects duplicate slugs with 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Acme Corp',
        slug: 'acme',
        contactEmail: 'ops@acme.example',
        apiKey: 'secret-api-key',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Another Co',
        slug: 'acme',
        contactEmail: 'ops@another.example',
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

  it('allows super admin to create tenant admins when impersonating the tenant', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Umbrella',
        slug: 'umbrella',
        contactEmail: 'contact@umbrella.test',
        apiKey: 'umbrella-key',
      },
    });
    const tenantId = createResponse.json().id as string;

    setSuperAdminTarget(tenantId);
    const response = await app.inject({
      method: 'POST',
      url: `/tenants/${tenantId}/admins`,
      payload: {
        email: 'admin@umbrella.test',
        displayName: 'Umbrella Admin',
      },
    });

    expect(response.statusCode).toBe(201);
    const saved = userRepository.getByEmail(tenantId, 'admin@umbrella.test');
    expect(saved).toMatchObject({ roles: ['TENANT_ADMIN'], displayName: 'Umbrella Admin' });
  });

  it('rejects tenant admin creation when header tenant mismatches target', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Stark Industries',
        slug: 'stark',
        contactEmail: 'contact@stark.test',
        apiKey: 'stark-key',
      },
    });
    const tenantId = createResponse.json().id as string;

    setSuperAdminTarget(superAdminTenantId);
    const response = await app.inject({
      method: 'POST',
      url: `/tenants/${tenantId}/admins`,
      payload: {
        email: 'admin@stark.test',
        displayName: 'Stark Admin',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'x-tenant-id must match target tenant' });
  });

  it('prevents duplicate tenant admin emails', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: {
        name: 'Wayne Enterprises',
        slug: 'wayne',
        contactEmail: 'contact@wayne.test',
        apiKey: 'wayne-key',
      },
    });
    const tenantId = createResponse.json().id as string;

    setSuperAdminTarget(tenantId);
    await app.inject({
      method: 'POST',
      url: `/tenants/${tenantId}/admins`,
      payload: {
        email: 'admin@wayne.test',
        displayName: 'Wayne Admin',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/tenants/${tenantId}/admins`,
      payload: {
        email: 'admin@wayne.test',
        displayName: 'Another Admin',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'User with email already exists' });
  });
});
