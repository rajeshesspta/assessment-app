import type { FastifyInstance } from 'fastify';
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
    const parsed = tenantRegistryInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid tenant payload', issues: parsed.error.issues };
    }
    const actorHeader = actorHeaderSchema.safeParse({ actor: request.headers['x-control-plane-actor'] });
    const actor = actorHeader.success ? actorHeader.data.actor : 'super-admin';
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
