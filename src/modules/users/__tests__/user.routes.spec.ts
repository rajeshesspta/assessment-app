import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userRoutes } from '../user.routes.js';
import { createInMemoryUserRepository } from '../user.repository.js';
import type { UserRepository } from '../user.repository.js';
import { TENANT_USER_ROLES } from '../../../common/types.js';

async function buildTestApp() {
  const repository = createInMemoryUserRepository();
  let currentTenantId = 'tenant-1';
  let currentActorTenantId = 'tenant-1';
  let currentIsSuperAdmin = false;

  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = currentTenantId;
    (request as any).actorTenantId = currentActorTenantId;
    (request as any).isSuperAdmin = currentIsSuperAdmin;
  });

  await app.register(userRoutes, {
    prefix: '/users',
    repository,
  });

  return {
    app,
    repository,
    setTenant(id: string) {
      currentTenantId = id;
      currentActorTenantId = id;
      currentIsSuperAdmin = false;
    },
    setTenantContext(tenantId: string, actorTenantId: string) {
      currentTenantId = tenantId;
      currentActorTenantId = actorTenantId;
      currentIsSuperAdmin = false;
    },
    setSuperAdminTenant(id: string) {
      currentTenantId = id;
      currentActorTenantId = id;
      currentIsSuperAdmin = true;
    },
  };
}

describe('userRoutes', () => {
  let app: FastifyInstance;
  let repository: UserRepository;
  let setTenant: (id: string) => void;
  let setTenantContext: (tenantId: string, actorTenantId: string) => void;
  let setSuperAdminTenant: (id: string) => void;

  beforeEach(async () => {
    const ctx = await buildTestApp();
    app = ctx.app;
    repository = ctx.repository;
    setTenant = ctx.setTenant;
    setTenantContext = ctx.setTenantContext;
    setSuperAdminTenant = ctx.setSuperAdminTenant;
    setTenant('tenant-1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates content authors for tenant contexts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'author@example.com',
        displayName: 'Author Example',
        role: 'CONTENT_AUTHOR',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      email: 'author@example.com',
      role: 'CONTENT_AUTHOR',
      tenantId: 'tenant-1',
      status: 'invited',
    });
    expect(repository.getByEmail('tenant-1', 'author@example.com')).toBeTruthy();
  });

  it('lists supported roles for clients', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/roles',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ roles: [...TENANT_USER_ROLES] });
  });

  it('rejects duplicate emails within the tenant', async () => {
    await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'learner@example.com',
        displayName: 'Learner One',
        role: 'LEARNER',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'learner@example.com',
        displayName: 'Another Learner',
        role: 'LEARNER',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'User with email already exists' });
  });

  it('rejects tenant mismatches between header and API key', async () => {
    setTenantContext('tenant-2', 'tenant-1');
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'mismatch@example.com',
        displayName: 'Mismatch User',
        role: 'LEARNER',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Tenant mismatch for API key' });
  });

  it('blocks super admin contexts', async () => {
    setSuperAdminTenant('sys-tenant');
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'blocked@example.com',
        displayName: 'Blocked',
        role: 'CONTENT_AUTHOR',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Super Admin must manage admins via /tenants/:id/admins' });
  });
});
