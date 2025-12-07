import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TenantRegistryRepository, TenantRecord } from '../repositories/tenant-registry';
import {
  tenantBrandingSchema,
  tenantClientAppSchema,
  tenantFeatureFlagSchema,
  tenantHeadlessStoredSchema,
  tenantRegistryInputSchema,
  type TenantRegistryInput,
} from '../tenant-schema';

const tenantIdParamsSchema = z.object({
  id: z.string().min(1),
});

const actorHeaderSchema = z.object({
  actor: z.string().min(1).optional(),
  roles: z.string().optional(),
});

const authProviderUpdateSchema = z.object({
  clientIdRef: z.string().min(1),
  clientSecretRef: z.string().min(1),
  redirectUris: z.array(z.string().min(1)).min(1),
});

const tenantAuthUpdateSchema = z.object({
  google: z.union([authProviderUpdateSchema, z.null()]).optional(),
  microsoft: z.union([authProviderUpdateSchema, z.null()]).optional(),
});

const tenantMetaUpdateSchema = z.object({
  name: z.string().min(1),
  hosts: z.array(z.string().min(1)).min(1),
  supportEmail: z.string().email(),
  premiumDeployment: z.boolean(),
  status: z.enum(['active', 'paused', 'deleting']),
  branding: tenantBrandingSchema,
  featureFlags: tenantFeatureFlagSchema,
});

const tenantHeadlessUpdateSchema = tenantHeadlessStoredSchema.omit({ tenantId: true });

const tenantClientAppUpdateSchema = tenantClientAppSchema;

function coerceHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
}

function parseActorContext(headers: Record<string, unknown>) {
  const parsed = actorHeaderSchema.safeParse({
    actor: coerceHeaderValue(headers['x-control-plane-actor']),
    roles: coerceHeaderValue(headers['x-control-plane-roles']),
  });

  const actor = parsed.success && parsed.data.actor ? parsed.data.actor : 'system';
  const roles: string[] = [];
  if (parsed.success && parsed.data.roles) {
    parsed.data.roles
      .split(',')
      .map(role => role.trim().toUpperCase())
      .filter(role => role.length > 0)
      .forEach(role => roles.push(role));
  }
  return { actor, roles };
}

function sanitizeRecord(record: TenantRecord | undefined) {
  if (!record) {
    return undefined;
  }
  const { updatedAt, updatedBy, ...rest } = record;
  return {
    ...rest,
    updatedAt,
    updatedBy,
  };
}

function recordToInput(record: TenantRecord): TenantRegistryInput {
  return tenantRegistryInputSchema.parse({
    id: record.id,
    name: record.name,
    hosts: record.hosts,
    supportEmail: record.supportEmail,
    premiumDeployment: record.premiumDeployment,
    headless: record.headless,
    auth: record.auth,
    clientApp: record.clientApp,
    branding: record.branding,
    featureFlags: record.featureFlags,
    status: record.status,
  });
}

export async function registerTenantRoutes(app: FastifyInstance, repo: TenantRegistryRepository) {
  app.get('/control/tenants', async () => {
    const tenants = await repo.listTenants();
    return tenants.map(record => sanitizeRecord(record));
  });

  app.post('/control/tenants', async (request, reply) => {
    const rawBody = typeof request.body === 'object' && request.body !== null ? request.body : {};
    const input: Record<string, any> = { ...(rawBody as Record<string, any>) };
    const tenantId = randomUUID();
    input.id = tenantId;
    if (input.headless && typeof input.headless === 'object') {
      input.headless.tenantId = tenantId;
    }
    const parsed = tenantRegistryInputSchema.safeParse(input);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid tenant payload', issues: parsed.error.issues };
    }
    const { actor } = parseActorContext(request.headers);
    const record = await repo.upsertTenant(parsed.data, actor);
    return sanitizeRecord(record);
  });

  app.get('/control/tenants/:id', async (request, reply) => {
    const params = tenantIdParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      reply.code(400);
      return { error: 'Invalid tenant id' };
    }
    const record = await repo.getTenant(params.data.id);
    if (!record) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }
    return sanitizeRecord(record);
  });

  // Super Admin only: update tenant auth (social providers)
  app.put('/control/tenants/:id/auth', async (request, reply) => {
    const params = tenantIdParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      reply.code(400);
      return { error: 'Invalid tenant id' };
    }

    const { actor, roles } = parseActorContext(request.headers);
    if (!roles.includes('SUPER_ADMIN')) {
      reply.code(403);
      return { error: 'Forbidden: only Super Admins may manage tenant identity providers' };
    }

    const body = request.body ?? {};
    const parsedBody = tenantAuthUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      reply.code(400);
      return { error: 'Invalid payload', issues: parsedBody.error.issues };
    }

    const record = await repo.getTenant(params.data.id);
    if (!record) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }

    type ProviderKey = 'google' | 'microsoft';
    type AuthRecord = NonNullable<TenantRecord['auth']>;
    let nextAuth: AuthRecord | undefined = record.auth ? { ...record.auth } : undefined;
    const updates = parsedBody.data;

    const applyUpdate = (key: ProviderKey) => {
      if (!(key in updates)) {
        return;
      }
      const value = updates[key];
      if (!value) {
        if (nextAuth) {
          delete nextAuth[key];
        }
        return;
      }
      const auth = nextAuth ?? (nextAuth = {} as AuthRecord);
      auth[key] = {
        enabled: true,
        clientIdRef: value.clientIdRef,
        clientSecretRef: value.clientSecretRef,
        redirectUris: value.redirectUris.map(uri => uri.trim()).filter(uri => uri.length > 0),
      } as AuthRecord[ProviderKey];
    };

    applyUpdate('google');
    applyUpdate('microsoft');

    if (nextAuth && Object.keys(nextAuth).length === 0) {
      nextAuth = undefined;
    }

    const updatedRecord = {
      ...record,
      auth: nextAuth,
    } as TenantRecord;

    const saved = await repo.upsertTenant(recordToInput(updatedRecord), actor);
    return sanitizeRecord(saved as TenantRecord);
  });

  app.patch('/control/tenants/:id/meta', async (request, reply) => {
    const params = tenantIdParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      reply.code(400);
      return { error: 'Invalid tenant id' };
    }

    const { actor, roles } = parseActorContext(request.headers);
    if (!roles.includes('SUPER_ADMIN')) {
      reply.code(403);
      return { error: 'Forbidden: only Super Admins may edit tenant metadata' };
    }

    const parsedBody = tenantMetaUpdateSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.code(400);
      return { error: 'Invalid payload', issues: parsedBody.error.issues };
    }

    const record = await repo.getTenant(params.data.id);
    if (!record) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }

    const updates = parsedBody.data;
    const updatedRecord: TenantRecord = {
      ...record,
      name: updates.name,
      hosts: updates.hosts,
      supportEmail: updates.supportEmail,
      premiumDeployment: updates.premiumDeployment,
      branding: updates.branding,
      featureFlags: updates.featureFlags,
      status: updates.status,
    } satisfies TenantRecord;

    const saved = await repo.upsertTenant(recordToInput(updatedRecord), actor);
    return sanitizeRecord(saved as TenantRecord);
  });

  app.patch('/control/tenants/:id/headless', async (request, reply) => {
    const params = tenantIdParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      reply.code(400);
      return { error: 'Invalid tenant id' };
    }

    const { actor, roles } = parseActorContext(request.headers);
    if (!roles.includes('SUPER_ADMIN')) {
      reply.code(403);
      return { error: 'Forbidden: only Super Admins may edit headless access' };
    }

    const parsedBody = tenantHeadlessUpdateSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.code(400);
      return { error: 'Invalid payload', issues: parsedBody.error.issues };
    }

    const record = await repo.getTenant(params.data.id);
    if (!record) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }

    const updatedRecord: TenantRecord = {
      ...record,
      headless: {
        ...record.headless,
        ...parsedBody.data,
        tenantId: record.headless.tenantId,
      },
    };

    const saved = await repo.upsertTenant(recordToInput(updatedRecord), actor);
    return sanitizeRecord(saved as TenantRecord);
  });

  app.patch('/control/tenants/:id/client-app', async (request, reply) => {
    const params = tenantIdParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      reply.code(400);
      return { error: 'Invalid tenant id' };
    }

    const { actor, roles } = parseActorContext(request.headers);
    if (!roles.includes('SUPER_ADMIN')) {
      reply.code(403);
      return { error: 'Forbidden: only Super Admins may edit client app access' };
    }

    const parsedBody = tenantClientAppUpdateSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.code(400);
      return { error: 'Invalid payload', issues: parsedBody.error.issues };
    }

    const record = await repo.getTenant(params.data.id);
    if (!record) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }

    const updatedRecord: TenantRecord = {
      ...record,
      clientApp: parsedBody.data,
    };

    const saved = await repo.upsertTenant(recordToInput(updatedRecord), actor);
    return sanitizeRecord(saved as TenantRecord);
  });
}
