import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createItem } from '../item.model.js';
import type { ItemRepository } from '../item.repository.js';
import { passThroughValidator } from '../../../common/fastify-schema.js';
import { eventBus } from '../../../common/event-bus.js';
import { toJsonSchema } from '../../../common/zod-json-schema.js';
import { createSchema } from '../item.routes.js';

export function registerItemPutRoute(app: FastifyInstance, repository: ItemRepository) {
  app.put('/:id', {
    schema: {
      tags: ['Items'],
      summary: 'Update an item',
      params: z.object({ id: z.string().uuid() }),
      body: toJsonSchema(createSchema, 'CreateItemRequest'),
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    try {
      // Authorization check (ensureItemManager)
      if (typeof (req as any).isSuperAdmin !== 'undefined' && (req as any).isSuperAdmin) {
        reply.code(403);
        reply.send({ error: 'Forbidden' });
        return;
      }
      const roles: string[] = (req as any).actorRoles ?? [];
      if (!roles.includes('CONTENT_AUTHOR') && !roles.includes('TENANT_ADMIN')) {
        reply.code(403);
        reply.send({ error: 'Forbidden' });
        return;
      }
      const id = (req.params as any).id as string;
      const tenantId = (req as any).tenantId as string;
      const existing = repository.getById(tenantId, id);
      if (!existing) {
        reply.code(404);
        return { error: 'Item not found' };
      }
      if ((req as any).validationError) {
        req.log.debug({ err: (req as any).validationError }, 'Ignoring Fastify validation error; using Zod');
      }
      let parsed: z.infer<typeof createSchema>;
      try {
        parsed = createSchema.parse(req.body ?? {});
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400);
          return { error: 'Invalid request body', issues: error.issues };
        }
        throw error;
      }

      // --- Taxonomy validation (same as POST) ---
      const { getTenantTaxonomyConfig } = await import('../../../config/tenant-taxonomy.js');
      const taxonomy = await getTenantTaxonomyConfig(tenantId);
      if (taxonomy) {
        const hasCategories = (obj: any): obj is { categories: string[] } => Array.isArray(obj.categories);
        const hasTags = (obj: any): obj is { tags: string[] } => Array.isArray(obj.tags);
        const hasMetadata = (obj: any): obj is { metadata: Record<string, any> } => typeof obj.metadata === 'object' && obj.metadata !== null;

        if (hasCategories(parsed) && taxonomy.categories.length > 0) {
          const invalid = parsed.categories.filter((cat: string) => !taxonomy.categories.includes(cat));
          if (invalid.length > 0) {
            reply.code(400);
            return { error: `Invalid categories: ${invalid.join(', ')}` };
          }
        }
        if (hasTags(parsed) && taxonomy.tags.predefined.length > 0) {
          const invalid = parsed.tags.filter((tag: string) => !taxonomy.tags.predefined.includes(tag));
          if (invalid.length > 0) {
            reply.code(400);
            return { error: `Invalid tags: ${invalid.join(', ')}` };
          }
        }
        if (hasMetadata(parsed) && taxonomy.metadataFields.length > 0) {
          for (const field of taxonomy.metadataFields) {
            const value = parsed.metadata[field.key];
            if (field.required && (value === undefined || value === null)) {
              reply.code(400);
              return { error: `Missing required metadata field: ${field.key}` };
            }
            if (value !== undefined) {
              switch (field.type) {
                case 'string':
                  if (typeof value !== 'string') {
                    reply.code(400);
                    return { error: `Metadata field ${field.key} must be a string` };
                  }
                  break;
                case 'number':
                  if (typeof value !== 'number') {
                    reply.code(400);
                    return { error: `Metadata field ${field.key} must be a number` };
                  }
                  break;
                case 'boolean':
                  if (typeof value !== 'boolean') {
                    reply.code(400);
                    return { error: `Metadata field ${field.key} must be a boolean` };
                  }
                  break;
                case 'enum':
                  if (!field.allowedValues?.includes(value)) {
                    reply.code(400);
                    return { error: `Metadata field ${field.key} must be one of: ${field.allowedValues?.join(', ')}` };
                  }
                  break;
                case 'array':
                  if (!Array.isArray(value)) {
                    reply.code(400);
                    return { error: `Metadata field ${field.key} must be an array` };
                  }
                  break;
                case 'object':
                  if (typeof value !== 'object' || Array.isArray(value) || value === null) {
                    reply.code(400);
                    return { error: `Metadata field ${field.key} must be an object` };
                  }
                  break;
              }
            }
          }
        }
      }

      // Reuse the same logic as POST but with the existing ID
      let item: any;
      if (parsed.kind === 'MCQ') {
        const unique = new Set<number>(parsed.correctIndexes);
        if (unique.size !== parsed.correctIndexes.length) {
          reply.code(400);
          return { error: 'correctIndexes must be unique' };
        }
        const outOfRange = parsed.correctIndexes.some((index: number) => index >= parsed.choices.length);
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
        item = createItem({
          id,
          tenantId,
          kind: 'MCQ',
          prompt: parsed.prompt,
          choices: parsed.choices,
          answerMode: parsed.answerMode,
          correctIndexes: [...parsed.correctIndexes].sort((a: number, b: number) => a - b),
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
      } else if (parsed.kind === 'TRUE_FALSE') {
        const tfChoices = [{ text: 'True' }, { text: 'False' }];
        const correctIndexes = [parsed.answerIsTrue ? 0 : 1];
        item = createItem({
          id,
          tenantId,
          kind: 'TRUE_FALSE',
          prompt: parsed.prompt,
          choices: tfChoices,
          answerMode: 'single',
          correctIndexes,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
      } else if (parsed.kind === 'FILL_IN_THE_BLANK') {
        const blankIds = new Set<string>(parsed.blanks.map((blank: any) => blank.id));
        if (blankIds.size !== parsed.blanks.length) {
          reply.code(400);
          return { error: 'Blank ids must be unique' };
        }
        const blanks = parsed.blanks.map((blank: any) => ({
          id: blank.id,
          acceptableAnswers: blank.answers.map((answer: any) => (
            answer.type === 'exact'
              ? { type: 'exact', value: answer.value, caseSensitive: answer.caseSensitive ?? false }
              : { type: 'regex', pattern: answer.pattern, flags: answer.flags }
          )),
        }));
        item = createItem({
          id,
          tenantId,
          kind: 'FILL_IN_THE_BLANK',
          prompt: parsed.prompt,
          blanks,
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
      } else {
        reply.code(400);
        return { error: 'Update not yet implemented for this item kind' };
      }

      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemUpdated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      return item;

    } catch (error) {
      req.log.error({ err: error }, 'Error in PUT /items');
      reply.code(500);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
}
