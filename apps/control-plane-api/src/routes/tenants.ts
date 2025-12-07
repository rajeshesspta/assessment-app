import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TenantRegistryRepository, TenantRecord } from '../repositories/tenant-registry';
import { tenantRegistryInputSchema } from '../tenant-schema';

const tenantIdParamsSchema = z.object({
  id: z.string().min(1),
});

const actorHeaderSchema = z.object({
  actor: z.string().min(1).optional(),
});

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

export async function registerTenantRoutes(app: FastifyInstance, repo: TenantRegistryRepository) {
  app.get('/control/tenants', async () => {
    const tenants = await repo.listTenants();
    return tenants.map(record => sanitizeRecord(record));
  });

  app.post('/control/tenants', async (request, reply) => {
    const input = request.body ?? {};
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
    const actorHeader = actorHeaderSchema.safeParse({ actor: request.headers['x-control-plane-actor'] });
    const actor = actorHeader.success && actorHeader.data.actor ? actorHeader.data.actor : 'system';
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

    const actorHeader = actorHeaderSchema.safeParse({ actor: request.headers['x-control-plane-actor'] });
    const actor = actorHeader.success && actorHeader.data.actor ? actorHeader.data.actor : 'unknown';
    if (actor !== 'super-admin') {
      reply.code(403);
      return { error: 'Forbidden: only super-admin may manage tenant identity providers' };
    }

    const body = request.body ?? {};
    // Basic structure validation: accept object with google/microsoft optional
    if (typeof body !== 'object') {
      reply.code(400);
      return { error: 'Invalid payload' };
    }

    const record = await repo.getTenant(params.data.id);
    if (!record) {
      reply.code(404);
      return { error: 'Tenant not found' };
    }

    // Merge and persist: keep other fields unchanged
    const updated = {
      ...record,
      auth: {
        ...(body.google ? body.google : {}),
        ...(body.microsoft ? body.microsoft : {}),
      },
    } as unknown as TenantRecord;

    // Use existing upsert path to persist (repo.upsertTenant expects TenantRegistryInput)
    // Build a minimal input object based on stored record
    const input = {
      id: updated.id,
      name: updated.name,
      hosts: updated.hosts,
      supportEmail: updated.supportEmail,
      premiumDeployment: updated.premiumDeployment,
      headless: updated.headless,
      auth: updated.auth,
      clientApp: updated.clientApp,
      branding: updated.branding,
      featureFlags: updated.featureFlags,
      status: updated.status,
    };

    const saved = await repo.upsertTenant(input as any, actor);
    return sanitizeRecord(saved as TenantRecord);
  });
}
