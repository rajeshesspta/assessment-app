import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userRoutes } from '../user.routes.js';
import { createInMemoryUserRepository } from '../user.repository.js';
import type { UserRepository } from '../user.repository.js';

async function buildTestApp() {
  const repository = createInMemoryUserRepository();
  let currentTenantId = 'tenant-1';
  let currentIsSuperAdmin = false;

  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = currentTenantId;
    (request as any).actorTenantId = currentTenantId;
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
      currentIsSuperAdmin = false;
    },
    setSuperAdminTenant(id: string) {
      currentTenantId = id;
      currentIsSuperAdmin = true;
    },
  };
}

describe('userRoutes', () => {
  let app: FastifyInstance;
  let repository: UserRepository;
  let setTenant: (id: string) => void;
  let setSuperAdminTenant: (id: string) => void;

  beforeEach(async () => {
    const ctx = await buildTestApp();
    app = ctx.app;
    repository = ctx.repository;
    setTenant = ctx.setTenant;
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

  it('allows super admin to create users', async () => {
    setSuperAdminTenant('sys-tenant');
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        email: 'admin-created@example.com',
        displayName: 'Admin Created',
        role: 'CONTENT_AUTHOR',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      email: 'admin-created@example.com',
      role: 'CONTENT_AUTHOR',
      tenantId: 'sys-tenant',
    });
  });
});
