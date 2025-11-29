import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createItem } from './item.model.js';
import type { ItemRepository } from './item.repository.js';
import { eventBus } from '../../common/event-bus.js';

const createSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.object({ text: z.string().min(1) })).min(2),
  correctIndex: z.number().int().nonnegative(),
});

const listQuerySchema = z.object({
  search: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export interface ItemRoutesOptions {
  repository: ItemRepository;
}

export async function itemRoutes(app: FastifyInstance, options: ItemRoutesOptions) {
  const { repository } = options;
  app.get('/', async req => {
    const tenantId = (req as any).tenantId as string;
    const { search, limit, offset } = listQuerySchema.parse(req.query ?? {});
    return repository.list(tenantId, { search, limit: limit ?? 10, offset: offset ?? 0 });
  });
  app.post('/', async (req, reply) => {
    const tenantId = (req as any).tenantId as string;
    const parsed = createSchema.parse(req.body);
    if (parsed.correctIndex >= parsed.choices.length) {
      reply.code(400);
      return { error: 'correctIndex out of range' };
    }
    const id = uuid();
    const item = createItem({ id, tenantId, kind: 'MCQ', ...parsed });
    repository.save(item);
    eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
    reply.code(201);
    return item;
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const item = repository.getById(tenantId, id);
    if (!item) { reply.code(404); return { error: 'Not found' }; }
    return item;
  });
}
