import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createItem } from '../item.model.js';
import type { ItemRepository } from '../item.repository.js';
import { getTenantTaxonomyConfig } from '../../../config/tenant-taxonomy.js';
import { passThroughValidator } from '../../../common/fastify-schema.js';
import { eventBus } from '../../../common/event-bus.js';
import { toJsonSchema } from '../../../common/zod-json-schema.js';
import { createSchema } from '../item.routes.js';

export function registerItemPostRoute(app: FastifyInstance, repository: ItemRepository) {
  app.post('/', {
    schema: {
      tags: ['Items'],
      summary: 'Create an item',
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
      const tenantId = (req as any).tenantId as string;
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

      // --- Item kind/type-specific validation (run before taxonomy) ---
      let itemKindValidationError: { code: number; error: string } | null = null;
      // MCQ
      if (parsed.kind === 'MCQ') {
        const unique = new Set(parsed.correctIndexes);
        if (unique.size !== parsed.correctIndexes.length) {
          itemKindValidationError = { code: 400, error: 'correctIndexes must be unique' };
        } else if (parsed.correctIndexes.some(index => index >= parsed.choices.length)) {
          itemKindValidationError = { code: 400, error: 'correctIndexes out of range' };
        } else if (parsed.answerMode === 'single' && parsed.correctIndexes.length !== 1) {
          itemKindValidationError = { code: 400, error: 'Single-answer items must include exactly one correct index' };
        } else if (parsed.answerMode === 'multiple' && parsed.correctIndexes.length < 2) {
          itemKindValidationError = { code: 400, error: 'Multi-answer items require at least two correct indexes' };
        }
      }
      // TRUE_FALSE
      if (!itemKindValidationError && parsed.kind === 'TRUE_FALSE') {
        // No extra validation needed
      }
      // FILL_IN_THE_BLANK
      if (!itemKindValidationError && parsed.kind === 'FILL_IN_THE_BLANK') {
        const blankIds = new Set(parsed.blanks.map(blank => blank.id));
        if (blankIds.size !== parsed.blanks.length) {
          itemKindValidationError = { code: 400, error: 'Blank ids must be unique' };
        }
      }
      // MATCHING
      if (!itemKindValidationError && parsed.kind === 'MATCHING') {
        const promptIds = new Set(parsed.prompts.map(p => p.id));
        const targetIds = new Set(parsed.targets.map(t => t.id));
        if (promptIds.size !== parsed.prompts.length) {
          itemKindValidationError = { code: 400, error: 'Prompt ids must be unique' };
        } else if (targetIds.size !== parsed.targets.length) {
          itemKindValidationError = { code: 400, error: 'Target ids must be unique' };
        } else if (parsed.targets.length < parsed.prompts.length) {
          itemKindValidationError = { code: 400, error: 'Targets must include at least as many entries as prompts' };
        } else {
          const invalidReference = parsed.prompts.find(prompt => !targetIds.has(prompt.correctTargetId));
          if (invalidReference) {
            itemKindValidationError = { code: 400, error: `Unknown target id: ${invalidReference.correctTargetId}` };
          }
        }
      }
      // ORDERING
      if (!itemKindValidationError && parsed.kind === 'ORDERING') {
        const optionIds = new Set(parsed.options.map(option => option.id));
        if (optionIds.size !== parsed.options.length) {
          itemKindValidationError = { code: 400, error: 'Option ids must be unique' };
        } else if (parsed.correctOrder.length !== parsed.options.length) {
          itemKindValidationError = { code: 400, error: 'correctOrder must include every option exactly once' };
        } else {
          const invalid = parsed.correctOrder.find(id => !optionIds.has(id));
          if (invalid) {
            itemKindValidationError = { code: 400, error: `Unknown option id: ${invalid}` };
          } else {
            const seen = new Set<string>();
            for (const id of parsed.correctOrder) {
              if (seen.has(id)) {
                itemKindValidationError = { code: 400, error: 'correctOrder cannot contain duplicates' };
                break;
              }
              seen.add(id);
            }
          }
        }
      }
      // SHORT_ANSWER
      if (!itemKindValidationError && parsed.kind === 'SHORT_ANSWER') {
        if (parsed.scoring.mode === 'ai_rubric' && !parsed.scoring.aiEvaluatorId) {
          itemKindValidationError = { code: 400, error: 'ai_rubric scoring requires aiEvaluatorId' };
        }
      }
      // ESSAY
      if (!itemKindValidationError && parsed.kind === 'ESSAY') {
        // ...existing code...
      }
      // NUMERIC_ENTRY
      if (!itemKindValidationError && parsed.kind === 'NUMERIC_ENTRY') {
        if (parsed.validation.mode === 'range' && parsed.validation.min > parsed.validation.max) {
          itemKindValidationError = { code: 400, error: 'Range min must be less than or equal to max' };
        }
      }
      // HOTSPOT
      if (!itemKindValidationError && parsed.kind === 'HOTSPOT') {
        const regionIds = new Set(parsed.hotspots.map(region => region.id));
        if (regionIds.size !== parsed.hotspots.length) {
          itemKindValidationError = { code: 400, error: 'Hotspot ids must be unique' };
        } else if (parsed.scoring.maxSelections && parsed.scoring.maxSelections > parsed.hotspots.length) {
          itemKindValidationError = { code: 400, error: 'maxSelections cannot exceed hotspot count' };
        } else if (parsed.scoring.mode === 'all' && parsed.scoring.maxSelections && parsed.scoring.maxSelections < parsed.hotspots.length) {
          itemKindValidationError = { code: 400, error: 'maxSelections must allow selecting every hotspot' };
        }
      }
      // DRAG_AND_DROP
      if (!itemKindValidationError && parsed.kind === 'DRAG_AND_DROP') {
        if (new Set(parsed.tokens.map(token => token.id)).size !== parsed.tokens.length) {
          itemKindValidationError = { code: 400, error: 'Token ids must be unique' };
        } else if (new Set(parsed.zones.map(zone => zone.id)).size !== parsed.zones.length) {
          itemKindValidationError = { code: 400, error: 'Zone ids must be unique' };
        } else {
          const tokenLookup = new Map(parsed.tokens.map(token => [token.id, token] as const));
          for (const zone of parsed.zones) {
            const normalizedAcceptsTokenIds = zone.acceptsTokenIds ? [...new Set(zone.acceptsTokenIds)] : undefined;
            if (normalizedAcceptsTokenIds) {
              const unknownAccept = normalizedAcceptsTokenIds.find(id => !tokenLookup.has(id));
              if (unknownAccept) {
                itemKindValidationError = { code: 400, error: `Zone ${zone.id} references unknown token ${unknownAccept}` };
                break;
              }
            }
            const seenCorrect = new Set<string>();
            for (const tokenId of zone.correctTokenIds) {
              if (!tokenLookup.has(tokenId)) {
                itemKindValidationError = { code: 400, error: `Zone ${zone.id} references unknown token ${tokenId}` };
                break;
              }
              if (seenCorrect.has(tokenId)) {
                itemKindValidationError = { code: 400, error: `Zone ${zone.id} cannot include duplicate token ${tokenId}` };
                break;
              }
              seenCorrect.add(tokenId);
            }
            if (itemKindValidationError) break;
            if (zone.evaluation === 'ordered' && zone.correctTokenIds.length < 2) {
              itemKindValidationError = { code: 400, error: 'Ordered zones must include at least two correct tokens' };
              break;
            }
            if (zone.maxTokens && zone.maxTokens < zone.correctTokenIds.length) {
              itemKindValidationError = { code: 400, error: `Zone ${zone.id} maxTokens must allow placing every correct token` };
              break;
            }
            if (normalizedAcceptsTokenIds) {
              const allowed = new Set(normalizedAcceptsTokenIds);
              const disallowed = zone.correctTokenIds.find(id => !allowed.has(id));
              if (disallowed) {
                itemKindValidationError = { code: 400, error: `Zone ${zone.id} correct tokens must be part of acceptsTokenIds` };
                break;
              }
            }
            const normalizedCategories = zone.acceptsCategories ? [...new Set(zone.acceptsCategories.map(c => c.toLowerCase()))] : undefined;
            if (normalizedCategories) {
              const allowedCategories = new Set(normalizedCategories);
              const invalidCategory = zone.correctTokenIds.find(tokenId => {
                const token = tokenLookup.get(tokenId);
                return !token?.category || !allowedCategories.has(token.category.trim().toLowerCase());
              });
              if (invalidCategory) {
                itemKindValidationError = { code: 400, error: `Zone ${zone.id} correct tokens must match acceptsCategories` };
                break;
              }
            }
          }
        }
      }
      // SCENARIO_TASK
      if (!itemKindValidationError && parsed.kind === 'SCENARIO_TASK') {
        const attachments = parsed.attachments ?? [];
        if (new Set(attachments.map(attachment => attachment.id)).size !== attachments.length) {
          itemKindValidationError = { code: 400, error: 'Attachment ids must be unique' };
        } else if (parsed.workspace?.instructions && parsed.workspace.instructions.some(instruction => !instruction.trim())) {
          itemKindValidationError = { code: 400, error: 'Workspace instructions cannot be empty strings' };
        } else if (parsed.evaluation.testCases && new Set(parsed.evaluation.testCases.map(test => test.id)).size !== parsed.evaluation.testCases.length) {
          itemKindValidationError = { code: 400, error: 'Test case ids must be unique' };
        }
      }

      if (itemKindValidationError) {
        reply.code(itemKindValidationError.code);
        return { error: itemKindValidationError.error };
      }

      // --- Taxonomy validation ---
      const taxonomyConfig = await getTenantTaxonomyConfig(tenantId);
      if (taxonomyConfig) {
        // Validate categories
        if (parsed.categories) {
          const invalid = parsed.categories.filter(cat => !taxonomyConfig.categories.includes(cat));
          if (invalid.length > 0) {
            reply.code(400);
            return { error: `Invalid categories: ${invalid.join(', ')}` };
          }
        }
        // Validate tags
        if (parsed.tags) {
          const invalidTags = parsed.tags.filter(tag => !taxonomyConfig.tags.predefined.includes(tag));
          if (invalidTags.length > 0) {
            reply.code(400);
            return { error: `Invalid tags: ${invalidTags.join(', ')}` };
          }
        }
        // Validate metadata fields
        if (parsed.metadata) {
          for (const [key, value] of Object.entries(parsed.metadata)) {
            const fieldConfig = taxonomyConfig.metadataFields.find(f => f.key === key);
            if (!fieldConfig) {
              reply.code(400);
              return { error: `Unknown metadata field: ${key}` };
            }
            if (fieldConfig.required && (value === undefined || value === null)) {
              reply.code(400);
              return { error: `Required metadata field: ${key}` };
            }
            // Type validation
            if (fieldConfig.type === 'string' && typeof value !== 'string') {
              reply.code(400);
              return { error: `Metadata field ${key} must be a string` };
            }
            if (fieldConfig.type === 'number' && typeof value !== 'number') {
              reply.code(400);
              return { error: `Metadata field ${key} must be a number` };
            }
            if (fieldConfig.type === 'boolean' && typeof value !== 'boolean') {
              reply.code(400);
              return { error: `Metadata field ${key} must be a boolean` };
            }
            if (fieldConfig.type === 'enum' && fieldConfig.allowedValues && !fieldConfig.allowedValues.includes(value)) {
              reply.code(400);
              return { error: `Invalid value for metadata field ${key}` };
            }
            // TODO: Add validation for array and object types
          }
          // Check required fields
          for (const field of taxonomyConfig.metadataFields) {
            if (field.required && !parsed.metadata.hasOwnProperty(field.key)) {
              reply.code(400);
              return { error: `Required metadata field: ${field.key}` };
            }
          }
        }
      }

      const id = uuid();
      // --- Item creation logic by kind ---
      if (parsed.kind === 'MCQ') {
        const item = createItem<import('../../../common/types.js').ChoiceItem>({
          id,
          tenantId,
          kind: 'MCQ',
          prompt: parsed.prompt,
          choices: parsed.choices,
          answerMode: parsed.answerMode,
          correctIndexes: [...parsed.correctIndexes].sort((a, b) => a - b),
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'TRUE_FALSE') {
        const tfChoices = [{ text: 'True' }, { text: 'False' }];
        const correctIndexes = [parsed.answerIsTrue ? 0 : 1];
        const item = createItem<import('../../../common/types.js').ChoiceItem>({
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
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'FILL_IN_THE_BLANK') {
        const blanks = parsed.blanks.map(blank => ({
          id: blank.id,
          acceptableAnswers: blank.answers.map(answer => {
            if (answer.type === 'exact') {
              return { type: 'exact' as const, value: answer.value, caseSensitive: answer.caseSensitive ?? false };
            } else {
              return { type: 'regex' as const, pattern: answer.pattern, flags: answer.flags };
            }
          }),
        }));
        const item = createItem<import('../../../common/types.js').FillBlankItem>({
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
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'MATCHING') {
        const item = createItem<import('../../../common/types.js').MatchingItem>({
          id,
          tenantId,
          kind: 'MATCHING',
          prompt: parsed.prompt,
          prompts: parsed.prompts,
          targets: parsed.targets,
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'ORDERING') {
        const item = createItem<import('../../../common/types.js').OrderingItem>({
          id,
          tenantId,
          kind: 'ORDERING',
          prompt: parsed.prompt,
          options: parsed.options,
          correctOrder: parsed.correctOrder,
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'SHORT_ANSWER') {
        const keywords = parsed.rubric?.keywords
          ?.map(keyword => keyword.trim())
          .filter((keyword, index, array) => keyword.length > 0 && array.indexOf(keyword) === index);
        const sampleAnswer = parsed.rubric?.sampleAnswer?.trim() || undefined;
        const rubric = parsed.rubric ? { ...parsed.rubric, keywords, sampleAnswer } : undefined;
        const item = createItem<import('../../../common/types.js').ShortAnswerItem>({
          id,
          tenantId,
          kind: 'SHORT_ANSWER',
          prompt: parsed.prompt,
          rubric,
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'ESSAY') {
        if (parsed.scoring.mode === 'ai_rubric' && !parsed.scoring.aiEvaluatorId) {
          reply.code(400);
          return { error: 'ai_rubric scoring requires aiEvaluatorId' };
        }
        const keywords = parsed.rubric?.keywords
          ?.map(keyword => keyword.trim())
          .filter((keyword, index, array) => keyword.length > 0 && array.indexOf(keyword) === index);
        const sampleAnswer = parsed.rubric?.sampleAnswer?.trim() || undefined;
        const sections = parsed.rubric?.sections?.map(section => ({
          ...section,
          keywords: section.keywords
            ?.map(keyword => keyword.trim())
            .filter((keyword, index, array) => keyword.length > 0 && array.indexOf(keyword) === index),
        }));
        const rubric = parsed.rubric ? { ...parsed.rubric, keywords, sections, sampleAnswer } : undefined;
        const item = createItem<import('../../../common/types.js').EssayItem>({
          id,
          tenantId,
          kind: 'ESSAY',
          prompt: parsed.prompt,
          rubric,
          length: parsed.length,
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'NUMERIC_ENTRY') {
        const normalizedUnits = parsed.units
          ? (() => {
              const candidate = {
                label: parsed.units.label?.trim() || undefined,
                symbol: parsed.units.symbol?.trim() || undefined,
                precision: parsed.units.precision,
              } as { label?: string; symbol?: string; precision?: number };
              if (!candidate.label && !candidate.symbol && candidate.precision === undefined) {
                return undefined;
              }
              return candidate;
            })()
          : undefined;
        const item = createItem<import('../../../common/types.js').NumericEntryItem>({
          id,
          tenantId,
          kind: 'NUMERIC_ENTRY',
          prompt: parsed.prompt,
          validation: parsed.validation,
          units: normalizedUnits,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'HOTSPOT') {
        const hotspots = parsed.hotspots.map(region => ({
          id: region.id,
          label: region.label?.trim() || undefined,
          points: region.points.map(point => ({ x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) })),
        }));
        const image = {
          url: parsed.image.url,
          width: parsed.image.width,
          height: parsed.image.height,
          alt: parsed.image.alt?.trim() || undefined,
        };
        const item = createItem<import('../../../common/types.js').HotspotItem>({
          id,
          tenantId,
          kind: 'HOTSPOT',
          prompt: parsed.prompt,
          image,
          hotspots,
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'DRAG_AND_DROP') {
        const ensureUniqueOrder = (values?: string[]) => {
          if (!values) return undefined;
          const seen = new Set<string>();
          const deduped: string[] = [];
          for (const value of values) {
            if (seen.has(value)) continue;
            seen.add(value);
            deduped.push(value);
          }
          return deduped;
        };
        const normalizeCategories = (categories?: string[]) => {
          if (!categories) return undefined;
          const trimmed = categories
            .map(category => category.trim())
            .filter(category => category.length > 0)
            .map(category => category.toLowerCase());
          if (!trimmed.length) {
            return undefined;
          }
          return ensureUniqueOrder(trimmed);
        };

        const tokens = [];
        for (const token of parsed.tokens) {
          const label = token.label.trim();
          if (!label) {
            reply.code(400);
            return { error: `Token ${token.id} label cannot be blank` };
          }
          const category = token.category?.trim();
          tokens.push({
            id: token.id,
            label,
            category: category && category.length > 0 ? category : undefined,
          });
        }
        const tokenLookup = new Map(tokens.map(token => [token.id, token] as const));
        const zones = [];
        for (const zone of parsed.zones) {
          const normalizedAcceptsTokenIds = ensureUniqueOrder(zone.acceptsTokenIds);
          const normalizedCategories = normalizeCategories(zone.acceptsCategories);
          zones.push({
            id: zone.id,
            label: zone.label?.trim() || undefined,
            acceptsTokenIds: normalizedAcceptsTokenIds,
            acceptsCategories: normalizedCategories,
            correctTokenIds: [...zone.correctTokenIds],
            evaluation: zone.evaluation,
            maxTokens: zone.maxTokens,
          });
        }
        const item = createItem<import('../../../common/types.js').DragDropItem>({
          id,
          tenantId,
          kind: 'DRAG_AND_DROP',
          prompt: parsed.prompt,
          tokens,
          zones,
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      if (parsed.kind === 'SCENARIO_TASK') {
        const attachments = parsed.attachments ?? [];
        const trimmedInstructions = parsed.workspace?.instructions
          ?.map(instruction => instruction.trim())
          .filter(instruction => instruction.length > 0);
        const item = createItem<import('../../../common/types.js').ScenarioTaskItem>({
          id,
          tenantId,
          kind: 'SCENARIO_TASK',
          prompt: parsed.prompt,
          brief: parsed.brief,
          attachments: attachments.length ? attachments : undefined,
          workspace: parsed.workspace
            ? {
                ...parsed.workspace,
                instructions: trimmedInstructions,
              }
            : undefined,
          evaluation: {
            ...parsed.evaluation,
            testCases: parsed.evaluation.testCases?.map(test => ({ ...test, weight: test.weight ?? 1 })),
          },
          scoring: parsed.scoring,
          categories: parsed.categories,
          tags: parsed.tags,
          metadata: parsed.metadata,
        });
        repository.save(item);
        eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
        reply.code(201);
        return item;
      }

      reply.code(400);
      return { error: 'Unknown item kind' };
    } catch (err) {
      req.log.error({ err }, 'Error in POST /items');
      reply.code(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
