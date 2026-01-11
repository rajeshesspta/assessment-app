import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UserRepository } from './user.repository.js';
import { createUser } from './user.model.js';
import { toJsonSchema } from '../../common/zod-json-schema.js';
import { passThroughValidator } from '../../common/fastify-schema.js';
import { TENANT_USER_ROLES, type TenantUserRole } from '../../common/types.js';

const allowedStatuses = ['active', 'invited', 'disabled'] as const;
type AllowedStatus = (typeof allowedStatuses)[number];

const createBodySchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120).optional(),
  roles: z.array(z.enum(TENANT_USER_ROLES)).nonempty(),
  status: z.enum(allowedStatuses).optional(),
  loginMethod: z.enum(['SIDP-GOOGLE', 'SIDP-MS', 'UPWD']).optional(),
});

const legacyBodySchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120).optional(),
  role: z.enum(TENANT_USER_ROLES),
  status: z.enum(allowedStatuses).optional(),
});

const createSchema = z.union([createBodySchema, legacyBodySchema]);

const updateBodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  roles: z.array(z.enum(TENANT_USER_ROLES)).nonempty().optional(),
  status: z.enum(allowedStatuses).optional(),
  loginMethod: z.enum(['SIDP-GOOGLE', 'SIDP-MS', 'UPWD']).optional(),
});

type CreateUserPayload = z.infer<typeof createSchema>;

function extractRoles(payload: CreateUserPayload): TenantUserRole[] {
  if ('roles' in payload) {
    return payload.roles;
  }
  return [payload.role];
}

const createUserBodySchema = toJsonSchema(createBodySchema, 'CreateUserRequest');
const updateUserBodySchema = toJsonSchema(updateBodySchema, 'UpdateUserRequest');
const listRolesResponseSchema = toJsonSchema(
  z.object({
    roles: z.array(z.enum(TENANT_USER_ROLES)),
  }),
  'SupportedUserRolesResponse',
);

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

  app.get('/roles', {
    schema: {
      tags: ['Users'],
      summary: 'List supported user roles',
      response: {
        200: listRolesResponseSchema,
      },
    },
  }, async () => ({
    roles: [...TENANT_USER_ROLES],
  }));

  app.post('/', {
    // schema: {
    //   tags: ['Users'],
    //   summary: 'Invite a Content Author, Learner, or Rater',
    //   description: `Available roles: ${TENANT_USER_ROLES.join(', ')}. Call GET /users/roles for the authoritative list.`,
    //   body: createUserBodySchema,
    // },
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
    let parsed;
    try {
      parsed = createSchema.parse(req.body);
    } catch (e) {
      req.log.error({ err: e }, 'Zod parse error');
      reply.code(400);
      return { error: 'Invalid input' };
    }
    const roles = extractRoles(parsed);
    const existing = repository.getByEmail(tenantId, parsed.email);
    if (existing) {
      reply.code(409);
      return { error: 'User with email already exists' };
    }
    const user = createUser({
      tenantId,
      roles,
      email: parsed.email,
      displayName: parsed.displayName,
      status: (parsed.status as AllowedStatus | undefined) ?? 'invited',
      loginMethod: (parsed as any).loginMethod,
    });
    repository.save(user);
    reply.code(201);
    return user;
  });

  app.get('/', {
    schema: {
      tags: ['Users'],
      summary: 'List users in the tenant',
    },
  }, async (req, reply) => {
    if (forbidSuperAdmin(req, reply)) return;
    if (!ensureTenantScope(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const role = (req.query as any).role as TenantUserRole | undefined;
    return repository.listByRole(tenantId, role);
  });

  app.get('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Get user by ID',
    },
  }, async (req, reply) => {
    if (forbidSuperAdmin(req, reply)) return;
    if (!ensureTenantScope(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const { id } = req.params as { id: string };
    let user = repository.getById(tenantId, id);
    if (!user && id.includes('@')) {
      user = repository.getByEmail(tenantId, id);
    }
    if (!user) {
      reply.code(404);
      return { error: 'User not found' };
    }
    return user;
  });

  app.put('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Update user',
      body: updateUserBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (forbidSuperAdmin(req, reply)) return;
    if (!ensureTenantScope(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const { id } = req.params as { id: string };
    const existing = repository.getById(tenantId, id);
    if (!existing) {
      reply.code(404);
      return { error: 'User not found' };
    }
    const parsed = updateBodySchema.parse(req.body);
    const updated: any = {
      ...existing,
      ...parsed,
      updatedAt: new Date().toISOString(),
    };
    repository.save(updated);
    return updated;
  });

  app.delete('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Delete user',
    },
  }, async (req, reply) => {
    if (forbidSuperAdmin(req, reply)) return;
    if (!ensureTenantScope(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const { id } = req.params as { id: string };
    repository.delete(tenantId, id);
    reply.code(204);
    return;
  });

  app.get('/by-email/:email', {
    schema: {
      tags: ['Users'],
      summary: 'Get user by email',
      params: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    if (forbidSuperAdmin(req, reply)) return;
    if (!ensureTenantScope(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const { email } = req.params as { email: string };
    const user = repository.getByEmail(tenantId, email);
    if (!user) {
      reply.code(404);
      return { error: 'User not found' };
    }
    return user;
  });
}
