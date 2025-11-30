import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UserRepository } from './user.repository.js';
import { createUser } from './user.model.js';
import { toJsonSchema } from '../../common/zod-json-schema.js';
import { passThroughValidator } from '../../common/fastify-schema.js';

const allowedRoles = ['CONTENT_AUTHOR', 'LEARNER'] as const;
const allowedStatuses = ['active', 'invited', 'disabled'] as const;

type AllowedRole = (typeof allowedRoles)[number];

type AllowedStatus = (typeof allowedStatuses)[number];

const createSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120).optional(),
  role: z.enum(allowedRoles),
  status: z.enum(allowedStatuses).optional(),
});

const createUserBodySchema = toJsonSchema(createSchema, 'CreateUserRequest');

function forbidSuperAdmin(request: any, reply: any): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Super Admin must manage admins via /tenants/:id/admins' });
    return true;
  }
  return false;
}

function ensureTenantScope(request: any, reply: any): boolean {
  const tenantId = request.tenantId as string | undefined;
  const actorTenantId = request.actorTenantId as string | undefined;
  if (tenantId && actorTenantId && tenantId !== actorTenantId) {
    reply.code(403);
    reply.send({ error: 'Tenant mismatch for API key' });
    return false;
  }
  return true;
}

export interface UserRoutesOptions {
  repository: UserRepository;
}

export async function userRoutes(app: FastifyInstance, options: UserRoutesOptions) {
  const { repository } = options;

  app.post('/', {
    schema: {
      tags: ['Users'],
      summary: 'Invite a Content Author or Learner',
      body: createUserBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (forbidSuperAdmin(req, reply)) {
      return;
    }
    if (!ensureTenantScope(req, reply)) {
      return;
    }
    const tenantId = (req as any).tenantId as string;
    const parsed = createSchema.parse(req.body);
    const existing = repository.getByEmail(tenantId, parsed.email);
    if (existing) {
      reply.code(409);
      return { error: 'User with email already exists' };
    }
    const user = createUser({
      tenantId,
      role: parsed.role as AllowedRole,
      email: parsed.email,
      displayName: parsed.displayName,
      status: (parsed.status as AllowedStatus | undefined) ?? 'invited',
    });
    repository.save(user);
    reply.code(201);
    return user;
  });
}
