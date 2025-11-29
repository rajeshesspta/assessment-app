import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TenantRepository } from './tenant.repository.js';
import { createTenant, updateTenant } from './tenant.model.js';
import type { UserRepository } from '../users/user.repository.js';
import { createUser } from '../users/user.model.js';

export interface TenantRoutesOptions {
  repository: TenantRepository;
  userRepository: UserRepository;
}

const rateLimitSchema = z.object({
  requestsPerMinute: z.number().int().positive(),
  burst: z.number().int().positive().optional(),
});

const persistenceSchema = z.object({
  provider: z.enum(['sqlite', 'memory', 'cosmos']),
});

const userStatusSchema = z.enum(['active', 'invited', 'disabled']);

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(60).optional(),
  contactEmail: z.string().email().optional(),
  apiKey: z.string().min(8),
  rateLimit: rateLimitSchema.optional(),
  persistence: persistenceSchema.optional(),
  metadata: z.record(z.string()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const updateSchema = createSchema.partial().refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

const createTenantAdminSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  status: userStatusSchema.optional(),
});

function isAdmin(request: any): boolean {
  return Boolean(request.isSuperAdmin);
}

function ensureAdmin(request: any, reply: any): boolean {
  if (!isAdmin(request)) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export async function tenantRoutes(app: FastifyInstance, options: TenantRoutesOptions) {
  const { repository, userRepository } = options;

  app.get('/current', async (req, reply) => {
    const tenantId = (req as any).tenantId as string;
    const tenant = repository.getById(tenantId) ?? repository.getBySlug(tenantId);
    if (!tenant) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }
    if (!isAdmin(req) && tenant.id !== tenantId && tenant.slug !== tenantId) {
      reply.code(403);
      return { error: 'Forbidden' };
    }
    return tenant;
  });

  app.get('/', async (req, reply) => {
    if (!ensureAdmin(req, reply)) return;
    return repository.list();
  });

  app.post('/', async (req, reply) => {
    if (!ensureAdmin(req, reply)) return;
    const parsed = createSchema.parse(req.body);
    if (parsed.slug && repository.getBySlug(parsed.slug)) {
      reply.code(409);
      return { error: 'Slug already exists' };
    }
    const tenant = createTenant({
      name: parsed.name,
      slug: parsed.slug,
      contactEmail: parsed.contactEmail,
      apiKey: parsed.apiKey,
      rateLimit: parsed.rateLimit,
      persistence: parsed.persistence,
      metadata: parsed.metadata,
      status: parsed.status,
    });
    repository.save(tenant);
    reply.code(201);
    return tenant;
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const tenant = repository.getById(id) ?? repository.getBySlug(id);
    if (!tenant) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }
    const requesterTenant = (req as any).tenantId as string;
    if (!isAdmin(req) && tenant.id !== requesterTenant && tenant.slug !== requesterTenant) {
      reply.code(403);
      return { error: 'Forbidden' };
    }
    return tenant;
  });

  app.patch('/:id', async (req, reply) => {
    if (!ensureAdmin(req, reply)) return;
    const id = (req.params as any).id as string;
    const existing = repository.getById(id) ?? repository.getBySlug(id);
    if (!existing) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }
    const parsed = updateSchema.parse(req.body);
    if (parsed.slug) {
      const conflict = repository.getBySlug(parsed.slug);
      if (conflict && conflict.id !== existing.id) {
        reply.code(409);
        return { error: 'Slug already exists' };
      }
    }
    const updated = updateTenant(existing, {
      name: parsed.name,
      slug: parsed.slug,
      contactEmail: parsed.contactEmail,
      apiKey: parsed.apiKey,
      rateLimit: parsed.rateLimit,
      persistence: parsed.persistence,
      metadata: parsed.metadata,
      status: parsed.status,
    });
    repository.save(updated);
    return updated;
  });

  app.delete('/:id', async (req, reply) => {
    if (!ensureAdmin(req, reply)) return;
    const id = (req.params as any).id as string;
    const existing = repository.getById(id) ?? repository.getBySlug(id);
    if (!existing) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }
    repository.delete(existing.id);
    reply.code(204);
  });

  app.post('/:id/admins', async (req, reply) => {
    if (!ensureAdmin(req, reply)) return;
    const paramId = (req.params as any).id as string;
    const tenant = repository.getById(paramId) ?? repository.getBySlug(paramId);
    if (!tenant) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }
    const tenantHeader = (req as any).tenantId as string;
    if (tenantHeader !== tenant.id && tenantHeader !== tenant.slug) {
      reply.code(400);
      return { error: 'x-tenant-id must match target tenant' };
    }
    const parsed = createTenantAdminSchema.parse(req.body);
    const existing = userRepository.getByEmail(tenant.id, parsed.email);
    if (existing) {
      reply.code(409);
      return { error: 'User with email already exists' };
    }
    const adminUser = createUser({
      tenantId: tenant.id,
      role: 'TENANT_ADMIN',
      email: parsed.email,
      displayName: parsed.displayName,
      status: parsed.status ?? 'invited',
      createdBy: 'super-admin',
    });
    userRepository.save(adminUser);
    reply.code(201);
    return adminUser;
  });
}
