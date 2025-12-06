import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TenantRegistryRepository, TenantRecord } from '../repositories/tenant-registry';
import { tenantRegistryInputSchema } from '../tenant-schema';

const tenantIdParamsSchema = z.object({
  id: z.string().min(1),
});

const actorHeaderSchema = z.object({
  actor: z.string().min(1).default('super-admin'),
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
    let actor = 'unknown';
    const actorHeader = actorHeaderSchema.safeParse({ actor: request.headers['x-control-plane-actor'] });
    if (actorHeader.success && actorHeader.data.actor && actorHeader.data.actor.toLowerCase() !== 'super-admin') {
      actor = actorHeader.data.actor;
    }
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
}
