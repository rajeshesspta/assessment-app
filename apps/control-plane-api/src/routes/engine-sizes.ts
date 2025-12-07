import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EngineSizeRepository } from '../repositories/engine-size';
import type { TenantRegistryRepository } from '../repositories/tenant-registry';
import { parseActorContext, isSuperAdmin } from './actor-context';

const engineSizeParamsSchema = z.object({
  id: z.string().uuid(),
});

const engineSizeCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().max(280).optional(),
});

const engineSizeUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().max(280).optional(),
  })
  .refine(data => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export async function registerEngineSizeRoutes(
  app: FastifyInstance,
  engineSizes: EngineSizeRepository,
  tenants: TenantRegistryRepository,
) {
  app.get('/control/engine-sizes', async () => {
    return engineSizes.listEngineSizes();
  });

  app.post('/control/engine-sizes', async (request, reply) => {
    const context = parseActorContext(request.headers);
    if (!isSuperAdmin(context)) {
      reply.code(403);
      return { error: 'Forbidden: only Super Admins may create engine sizes' };
    }

    const parsedBody = engineSizeCreateSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.code(400);
      return { error: 'Invalid payload', issues: parsedBody.error.issues };
    }

    const record = await engineSizes.createEngineSize(parsedBody.data);
    return record;
  });

  app.patch('/control/engine-sizes/:id', async (request, reply) => {
    const params = engineSizeParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      reply.code(400);
      return { error: 'Invalid engine size id' };
    }

    const context = parseActorContext(request.headers);
    if (!isSuperAdmin(context)) {
      reply.code(403);
      return { error: 'Forbidden: only Super Admins may edit engine sizes' };
    }

    const parsedBody = engineSizeUpdateSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      reply.code(400);
      return { error: 'Invalid payload', issues: parsedBody.error.issues };
    }

    try {
      const record = await engineSizes.updateEngineSize(params.data.id, parsedBody.data);
      return record;
    } catch (error) {
      if ((error as Error).message === 'Engine size not found') {
        reply.code(404);
        return { error: 'Engine size not found' };
      }
      throw error;
    }
  });

  app.delete('/control/engine-sizes/:id', async (request, reply) => {
    const params = engineSizeParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      reply.code(400);
      return { error: 'Invalid engine size id' };
    }

    const context = parseActorContext(request.headers);
    if (!isSuperAdmin(context)) {
      reply.code(403);
      return { error: 'Forbidden: only Super Admins may delete engine sizes' };
    }

    const assignedTenants = await tenants.listTenants();
    const inUse = assignedTenants.some(tenant => tenant.engineSize?.id === params.data.id);
    if (inUse) {
      reply.code(409);
      return { error: 'Cannot delete engine size while tenants reference it' };
    }

    await engineSizes.deleteEngineSize(params.data.id);
    reply.code(204);
  });
}
