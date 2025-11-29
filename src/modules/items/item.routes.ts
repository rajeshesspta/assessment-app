import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createItem } from './item.model.js';
import type { ItemRepository } from './item.repository.js';
import { eventBus } from '../../common/event-bus.js';

const mcqSchema = z.object({
  kind: z.literal('MCQ').default('MCQ'),
  prompt: z.string().min(1),
  choices: z.array(z.object({ text: z.string().min(1) })).min(2),
  answerMode: z.enum(['single', 'multiple']).default('single'),
  correctIndexes: z.array(z.number().int().nonnegative()).nonempty(),
});

const trueFalseSchema = z.object({
  kind: z.literal('TRUE_FALSE'),
  prompt: z.string().min(1),
  answerIsTrue: z.boolean(),
});

const fillBlankAnswerSchema = z.union([
  z.object({ type: z.literal('exact'), value: z.string().min(1), caseSensitive: z.boolean().optional() }),
  z.object({ type: z.literal('regex'), pattern: z.string().min(1), flags: z.string().regex(/^[gimsuy]*$/).default('i') }),
]);

const fillBlankSchema = z.object({
  kind: z.literal('FILL_IN_THE_BLANK'),
  prompt: z.string().min(1),
  blanks: z.array(z.object({
    id: z.string().min(1),
    answers: z.array(fillBlankAnswerSchema).nonempty(),
  })).nonempty(),
  scoring: z.object({ mode: z.enum(['all', 'partial']).default('all') }).default({ mode: 'all' }),
});

const matchingSchema = z.object({
  kind: z.literal('MATCHING'),
  prompt: z.string().min(1),
  prompts: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    correctTargetId: z.string().min(1),
  })).min(1),
  targets: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
  })).min(1),
  scoring: z.object({ mode: z.enum(['all', 'partial']).default('partial') }).default({ mode: 'partial' }),
});

const orderingSchema = z.object({
  kind: z.literal('ORDERING'),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).min(2),
  correctOrder: z.array(z.string().min(1)).min(2),
  scoring: z
    .object({
      mode: z.enum(['all', 'partial_pairs']).default('all'),
      customEvaluatorId: z.string().min(1).optional(),
    })
    .default({ mode: 'all' }),
});

const createSchema = z.discriminatedUnion('kind', [mcqSchema, trueFalseSchema, fillBlankSchema, matchingSchema, orderingSchema]);

const listQuerySchema = z.object({
  search: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  kind: z.enum(['MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'MATCHING', 'ORDERING']).optional(),
});

export interface ItemRoutesOptions {
  repository: ItemRepository;
}

export async function itemRoutes(app: FastifyInstance, options: ItemRoutesOptions) {
  const { repository } = options;
  app.get('/', async req => {
    const tenantId = (req as any).tenantId as string;
    const { search, limit, offset, kind } = listQuerySchema.parse(req.query ?? {});
    return repository.list(tenantId, { search, kind, limit: limit ?? 10, offset: offset ?? 0 });
  });
  app.post('/', async (req, reply) => {
    const tenantId = (req as any).tenantId as string;
    const parsed = createSchema.parse(req.body ?? {});
    const id = uuid();
    if (parsed.kind === 'MCQ') {
      const unique = new Set(parsed.correctIndexes);
      if (unique.size !== parsed.correctIndexes.length) {
        reply.code(400);
        return { error: 'correctIndexes must be unique' };
      }
      const outOfRange = parsed.correctIndexes.some(index => index >= parsed.choices.length);
      if (outOfRange) {
        reply.code(400);
        return { error: 'correctIndexes out of range' };
      }
      if (parsed.answerMode === 'single' && parsed.correctIndexes.length !== 1) {
        reply.code(400);
        return { error: 'Single-answer items must include exactly one correct index' };
      }
      if (parsed.answerMode === 'multiple' && parsed.correctIndexes.length < 2) {
        reply.code(400);
        return { error: 'Multi-answer items require at least two correct indexes' };
      }
      const item = createItem({
        id,
        tenantId,
        kind: 'MCQ',
        prompt: parsed.prompt,
        choices: parsed.choices,
        answerMode: parsed.answerMode,
        correctIndexes: [...parsed.correctIndexes].sort((a, b) => a - b),
      });
      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      reply.code(201);
      return item;
    }

    if (parsed.kind === 'TRUE_FALSE') {
      const tfChoices = [{ text: 'True' }, { text: 'False' }];
      const correctIndexes = [parsed.answerIsTrue ? 0 : 1];
      const item = createItem({
        id,
        tenantId,
        kind: 'TRUE_FALSE',
        prompt: parsed.prompt,
        choices: tfChoices,
        answerMode: 'single',
        correctIndexes,
      });
      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      reply.code(201);
      return item;
    }

    if (parsed.kind === 'FILL_IN_THE_BLANK') {
      const blankIds = new Set(parsed.blanks.map(blank => blank.id));
      if (blankIds.size !== parsed.blanks.length) {
        reply.code(400);
        return { error: 'Blank ids must be unique' };
      }

      const blanks = parsed.blanks.map(blank => ({
        id: blank.id,
        acceptableAnswers: blank.answers.map(answer => (
          answer.type === 'exact'
            ? { type: 'exact', value: answer.value, caseSensitive: answer.caseSensitive ?? false }
            : { type: 'regex', pattern: answer.pattern, flags: answer.flags }
        )),
      }));

      const item = createItem({
        id,
        tenantId,
        kind: 'FILL_IN_THE_BLANK',
        prompt: parsed.prompt,
        blanks,
        scoring: parsed.scoring,
      });
      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      reply.code(201);
      return item;
    }

  if (parsed.kind === 'MATCHING') {
    const promptIds = new Set(parsed.prompts.map(p => p.id));
    const targetIds = new Set(parsed.targets.map(t => t.id));
    if (promptIds.size !== parsed.prompts.length) {
      reply.code(400);
      return { error: 'Prompt ids must be unique' };
    }
    if (targetIds.size !== parsed.targets.length) {
      reply.code(400);
      return { error: 'Target ids must be unique' };
    }
    const invalidReference = parsed.prompts.find(prompt => !targetIds.has(prompt.correctTargetId));
    if (invalidReference) {
      reply.code(400);
      return { error: `Unknown target id: ${invalidReference.correctTargetId}` };
    }

    const item = createItem({
      id,
      tenantId,
      kind: 'MATCHING',
      prompt: parsed.prompt,
      prompts: parsed.prompts,
      targets: parsed.targets,
      scoring: parsed.scoring,
    });
    repository.save(item);
    eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
    reply.code(201);
    return item;
  }

  if (parsed.kind === 'ORDERING') {
    const optionIds = new Set(parsed.options.map(option => option.id));
    if (optionIds.size !== parsed.options.length) {
      reply.code(400);
      return { error: 'Option ids must be unique' };
    }
    if (parsed.correctOrder.length !== parsed.options.length) {
      reply.code(400);
      return { error: 'correctOrder must include every option exactly once' };
    }
    const invalid = parsed.correctOrder.find(id => !optionIds.has(id));
    if (invalid) {
      reply.code(400);
      return { error: `Unknown option id: ${invalid}` };
    }
    const seen = new Set<string>();
    for (const id of parsed.correctOrder) {
      if (seen.has(id)) {
        reply.code(400);
        return { error: 'correctOrder cannot contain duplicates' };
      }
      seen.add(id);
    }
    const item = createItem({
      id,
      tenantId,
      kind: 'ORDERING',
      prompt: parsed.prompt,
      options: parsed.options,
      correctOrder: parsed.correctOrder,
      scoring: parsed.scoring,
    });
    repository.save(item);
    eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
    reply.code(201);
    return item;
  }

  return reply.code(400).send({ error: 'Unsupported item kind' });
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const item = repository.getById(tenantId, id);
    if (!item) { reply.code(404); return { error: 'Not found' }; }
    return item;
  });
}
