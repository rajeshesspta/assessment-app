import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createItem } from './item.model.js';
import { itemRepository } from './item.repository.js';
import { eventBus } from '../../common/event-bus.js';

const createSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.object({ text: z.string().min(1) })).min(2),
  correctIndex: z.number().int().nonnegative(),
});

export async function itemRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const tenantId = (req as any).tenantId as string;
    const parsed = createSchema.parse(req.body);
    if (parsed.correctIndex >= parsed.choices.length) {
      reply.code(400);
      return { error: 'correctIndex out of range' };
    }
    const id = uuid();
    const item = createItem({ id, tenantId, kind: 'MCQ', ...parsed });
    itemRepository.save(item);
    eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
    reply.code(201);
    return item;
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const item = itemRepository.get(id);
    if (!item) { reply.code(404); return { error: 'Not found' }; }
    return item;
  });
}
