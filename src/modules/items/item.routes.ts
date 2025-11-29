import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createItem } from './item.model.js';
import type { ItemRepository } from './item.repository.js';
import type {
  ChoiceItem,
  DragDropItem,
  EssayItem,
  FillBlankItem,
  HotspotItem,
  MatchingItem,
  NumericEntryItem,
  OrderingItem,
  ScenarioTaskItem,
  ShortAnswerItem,
} from '../../common/types.js';
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

const shortAnswerSchema = z.object({
  kind: z.literal('SHORT_ANSWER'),
  prompt: z.string().min(1),
  rubric: z
    .object({
      keywords: z.array(z.string().min(1).max(80)).max(10).optional(),
      guidance: z.string().min(1).max(500).optional(),
    })
    .optional(),
  scoring: z
    .object({
      mode: z.enum(['manual', 'ai_rubric']).default('manual'),
      maxScore: z.number().int().positive().max(10).default(1),
      aiEvaluatorId: z.string().min(1).optional(),
    }),
});

const essayLengthSchema = z.object({
  minWords: z.number().int().positive().max(2000).optional(),
  maxWords: z.number().int().positive().max(5000).optional(),
  recommendedWords: z.number().int().positive().max(5000).optional(),
}).refine(data => {
  if (data.minWords && data.maxWords && data.minWords > data.maxWords) {
    return false;
  }
  if (data.recommendedWords) {
    if (data.minWords && data.recommendedWords < data.minWords) {
      return false;
    }
    if (data.maxWords && data.recommendedWords > data.maxWords) {
      return false;
    }
  }
  return true;
}, { message: 'Word counts must satisfy min <= recommended <= max' });

const essaySchema = z.object({
  kind: z.literal('ESSAY'),
  prompt: z.string().min(1),
  length: essayLengthSchema.optional(),
  rubric: z
    .object({
      keywords: z.array(z.string().min(1).max(120)).max(20).optional(),
      guidance: z.string().min(1).max(2000).optional(),
      sections: z.array(z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().max(1000).optional(),
        maxScore: z.number().int().positive().max(20),
        keywords: z.array(z.string().min(1).max(120)).max(10).optional(),
      })).max(10).optional(),
    })
    .optional(),
  scoring: z
    .object({
      mode: z.enum(['manual', 'ai_rubric']).default('manual'),
      maxScore: z.number().int().positive().max(50).default(10),
      aiEvaluatorId: z.string().min(1).optional(),
    }),
});

const numericUnitsSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  symbol: z.string().min(1).max(16).optional(),
  precision: z.number().int().nonnegative().max(6).optional(),
});

const numericExactSchema = z.object({ mode: z.literal('exact'), value: z.number(), tolerance: z.number().nonnegative().optional() });
const numericRangeSchema = z.object({ mode: z.literal('range'), min: z.number(), max: z.number() });

const numericEntrySchema = z.object({
  kind: z.literal('NUMERIC_ENTRY'),
  prompt: z.string().min(1),
  validation: z.discriminatedUnion('mode', [numericExactSchema, numericRangeSchema]),
  units: numericUnitsSchema.optional(),
});

const hotspotPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const hotspotSchema = z.object({
  kind: z.literal('HOTSPOT'),
  prompt: z.string().min(1),
  image: z.object({
    url: z.string().url(),
    width: z.number().int().positive().max(10000),
    height: z.number().int().positive().max(10000),
    alt: z.string().min(1).max(200).optional(),
  }),
  hotspots: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(120).optional(),
    points: z.array(hotspotPointSchema).min(3),
  })).min(1),
  scoring: z.object({
    mode: z.enum(['all', 'partial']).default('all'),
    maxSelections: z.number().int().positive().max(20).optional(),
  }).default({ mode: 'all' }),
});

const dragDropTokenSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: z.string().min(1).optional(),
});

const dragDropZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120).optional(),
  acceptsTokenIds: z.array(z.string().min(1)).min(1).optional(),
  acceptsCategories: z.array(z.string().min(1)).min(1).optional(),
  correctTokenIds: z.array(z.string().min(1)).min(1),
  evaluation: z.enum(['set', 'ordered']).default('set'),
  maxTokens: z.number().int().positive().max(20).optional(),
});

const dragDropSchema = z.object({
  kind: z.literal('DRAG_AND_DROP'),
  prompt: z.string().min(1),
  tokens: z.array(dragDropTokenSchema).min(2),
  zones: z.array(dragDropZoneSchema).min(1),
  scoring: z.object({ mode: z.enum(['all', 'per_zone', 'per_token']).default('all') }).default({ mode: 'all' }),
});

const scenarioAttachmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(160),
  url: z.string().url(),
  kind: z.enum(['reference', 'starter', 'supporting', 'dataset']).default('reference'),
  contentType: z.string().min(1).max(120).optional(),
  sizeBytes: z.number().int().positive().max(50_000_000).optional(),
});

const scenarioWorkspaceSchema = z.object({
  templateRepositoryUrl: z.string().url().optional(),
  branch: z.string().min(1).max(120).optional(),
  instructions: z.array(z.string().min(1).max(1000)).max(20).optional(),
}).refine(data => {
  if (!data.templateRepositoryUrl && !data.instructions && !data.branch) {
    return true;
  }
  if (!data.templateRepositoryUrl && data.branch) {
    return false;
  }
  return true;
}, { message: 'workspace.branch requires templateRepositoryUrl' });

const scenarioTestCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1).max(500).optional(),
  weight: z.number().positive().max(100).default(1),
});

const scenarioEvaluationSchema = z.object({
  mode: z.enum(['manual', 'automated']),
  automationServiceId: z.string().min(1).optional(),
  runtime: z.string().min(1).max(120).optional(),
  entryPoint: z.string().min(1).max(200).optional(),
  timeoutSeconds: z.number().int().positive().max(900).optional(),
  testCases: z.array(scenarioTestCaseSchema).max(50).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === 'automated' && !value.automationServiceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['automationServiceId'],
      message: 'automationServiceId is required when evaluation.mode is automated',
    });
  }
});

const scenarioScoringSchema = z.object({
  maxScore: z.number().int().positive().max(100).default(10),
  rubric: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string().min(1).max(500).optional(),
        weight: z.number().positive().max(100).optional(),
      }),
    )
    .max(20)
    .optional(),
});

const scenarioTaskSchema = z.object({
  kind: z.literal('SCENARIO_TASK'),
  prompt: z.string().min(1),
  brief: z.string().min(1).max(5000),
  attachments: z.array(scenarioAttachmentSchema).max(10).optional(),
  workspace: scenarioWorkspaceSchema.optional(),
  evaluation: scenarioEvaluationSchema,
  scoring: scenarioScoringSchema,
});

const createSchema = z.discriminatedUnion('kind', [
  mcqSchema,
  trueFalseSchema,
  fillBlankSchema,
  matchingSchema,
  orderingSchema,
  shortAnswerSchema,
  essaySchema,
  numericEntrySchema,
  hotspotSchema,
  dragDropSchema,
  scenarioTaskSchema,
]);

const listQuerySchema = z.object({
  search: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  kind: z
    .enum([
      'MCQ',
      'TRUE_FALSE',
      'FILL_IN_THE_BLANK',
      'MATCHING',
      'ORDERING',
      'SHORT_ANSWER',
      'ESSAY',
      'NUMERIC_ENTRY',
      'HOTSPOT',
      'DRAG_AND_DROP',
      'SCENARIO_TASK',
    ])
    .optional(),
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
      const item = createItem<ChoiceItem>({
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
      const item = createItem<ChoiceItem>({
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

      const blanks: FillBlankItem['blanks'] = parsed.blanks.map(blank => ({
        id: blank.id,
        acceptableAnswers: blank.answers.map(answer => (
          answer.type === 'exact'
            ? { type: 'exact', value: answer.value, caseSensitive: answer.caseSensitive ?? false }
            : { type: 'regex', pattern: answer.pattern, flags: answer.flags }
        )),
      }));

      const item = createItem<FillBlankItem>({
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

      const item = createItem<MatchingItem>({
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
      const item = createItem<OrderingItem>({
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

    if (parsed.kind === 'SHORT_ANSWER') {
      if (parsed.scoring.mode === 'ai_rubric' && !parsed.scoring.aiEvaluatorId) {
        reply.code(400);
        return { error: 'ai_rubric scoring requires aiEvaluatorId' };
      }
      const keywords = parsed.rubric?.keywords
        ?.map(keyword => keyword.trim())
        .filter((keyword, index, array) => keyword.length > 0 && array.indexOf(keyword) === index);
      const rubric = parsed.rubric ? { ...parsed.rubric, keywords } : undefined;
      const item = createItem<ShortAnswerItem>({
        id,
        tenantId,
        kind: 'SHORT_ANSWER',
        prompt: parsed.prompt,
        rubric,
        scoring: parsed.scoring,
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
      const sections = parsed.rubric?.sections?.map(section => ({
        ...section,
        keywords: section.keywords
          ?.map(keyword => keyword.trim())
          .filter((keyword, index, array) => keyword.length > 0 && array.indexOf(keyword) === index),
      }));
      const rubric = parsed.rubric ? { ...parsed.rubric, keywords, sections } : undefined;
      const item = createItem<EssayItem>({
        id,
        tenantId,
        kind: 'ESSAY',
        prompt: parsed.prompt,
        rubric,
        length: parsed.length,
        scoring: parsed.scoring,
      });
      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      reply.code(201);
      return item;
    }

    if (parsed.kind === 'NUMERIC_ENTRY') {
      if (parsed.validation.mode === 'range' && parsed.validation.min > parsed.validation.max) {
        reply.code(400);
        return { error: 'Range min must be less than or equal to max' };
      }
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
      const item = createItem<NumericEntryItem>({
        id,
        tenantId,
        kind: 'NUMERIC_ENTRY',
        prompt: parsed.prompt,
        validation: parsed.validation,
        units: normalizedUnits,
      });
      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      reply.code(201);
      return item;
    }

    if (parsed.kind === 'HOTSPOT') {
      const regionIds = new Set(parsed.hotspots.map(region => region.id));
      if (regionIds.size !== parsed.hotspots.length) {
        reply.code(400);
        return { error: 'Hotspot ids must be unique' };
      }
      if (parsed.scoring.maxSelections && parsed.scoring.maxSelections > parsed.hotspots.length) {
        reply.code(400);
        return { error: 'maxSelections cannot exceed hotspot count' };
      }
      if (parsed.scoring.mode === 'all' && parsed.scoring.maxSelections && parsed.scoring.maxSelections < parsed.hotspots.length) {
        reply.code(400);
        return { error: 'maxSelections must allow selecting every hotspot' };
      }
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
      const item = createItem<HotspotItem>({
        id,
        tenantId,
        kind: 'HOTSPOT',
        prompt: parsed.prompt,
        image,
        hotspots,
        scoring: parsed.scoring,
      });
      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      reply.code(201);
      return item;
    }

    if (parsed.kind === 'DRAG_AND_DROP') {
      if (new Set(parsed.tokens.map(token => token.id)).size !== parsed.tokens.length) {
        reply.code(400);
        return { error: 'Token ids must be unique' };
      }
      const zoneIdSet = new Set(parsed.zones.map(zone => zone.id));
      if (zoneIdSet.size !== parsed.zones.length) {
        reply.code(400);
        return { error: 'Zone ids must be unique' };
      }
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

      const tokens: DragDropItem['tokens'] = [];
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
      const zones: DragDropItem['zones'] = [];
      for (const zone of parsed.zones) {
        const normalizedAcceptsTokenIds = ensureUniqueOrder(zone.acceptsTokenIds);
        if (normalizedAcceptsTokenIds) {
          const unknownAccept = normalizedAcceptsTokenIds.find(id => !tokenLookup.has(id));
          if (unknownAccept) {
            reply.code(400);
            return { error: `Zone ${zone.id} references unknown token ${unknownAccept}` };
          }
        }
        const seenCorrect = new Set<string>();
        for (const tokenId of zone.correctTokenIds) {
          if (!tokenLookup.has(tokenId)) {
            reply.code(400);
            return { error: `Zone ${zone.id} references unknown token ${tokenId}` };
          }
          if (seenCorrect.has(tokenId)) {
            reply.code(400);
            return { error: `Zone ${zone.id} cannot include duplicate token ${tokenId}` };
          }
          seenCorrect.add(tokenId);
        }
        if (zone.evaluation === 'ordered' && zone.correctTokenIds.length < 2) {
          reply.code(400);
          return { error: 'Ordered zones must include at least two correct tokens' };
        }
        if (zone.maxTokens && zone.maxTokens < zone.correctTokenIds.length) {
          reply.code(400);
          return { error: `Zone ${zone.id} maxTokens must allow placing every correct token` };
        }
        if (normalizedAcceptsTokenIds) {
          const allowed = new Set(normalizedAcceptsTokenIds);
          const disallowed = zone.correctTokenIds.find(id => !allowed.has(id));
          if (disallowed) {
            reply.code(400);
            return { error: `Zone ${zone.id} correct tokens must be part of acceptsTokenIds` };
          }
        }
        const normalizedCategories = normalizeCategories(zone.acceptsCategories);
        if (normalizedCategories) {
          const allowedCategories = new Set(normalizedCategories);
          const invalidCategory = zone.correctTokenIds.find(tokenId => {
            const token = tokenLookup.get(tokenId);
            return !token?.category || !allowedCategories.has(token.category);
          });
          if (invalidCategory) {
            reply.code(400);
            return { error: `Zone ${zone.id} correct tokens must match acceptsCategories` };
          }
        }
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
      const item = createItem<DragDropItem>({
        id,
        tenantId,
        kind: 'DRAG_AND_DROP',
        prompt: parsed.prompt,
        tokens,
        zones,
        scoring: parsed.scoring,
      });
      repository.save(item);
      eventBus.publish({ id: uuid(), type: 'ItemCreated', occurredAt: new Date().toISOString(), tenantId, payload: { itemId: item.id } });
      reply.code(201);
      return item;
    }

    if (parsed.kind === 'SCENARIO_TASK') {
      const attachments = parsed.attachments ?? [];
      if (new Set(attachments.map(attachment => attachment.id)).size !== attachments.length) {
        reply.code(400);
        return { error: 'Attachment ids must be unique' };
      }

      const trimmedInstructions = parsed.workspace?.instructions
        ?.map(instruction => instruction.trim())
        .filter(instruction => instruction.length > 0);
      if (parsed.workspace?.instructions && trimmedInstructions && trimmedInstructions.length !== parsed.workspace.instructions.length) {
        reply.code(400);
        return { error: 'Workspace instructions cannot be empty strings' };
      }

      if (parsed.evaluation.testCases) {
        const testCaseIds = new Set(parsed.evaluation.testCases.map(test => test.id));
        if (testCaseIds.size !== parsed.evaluation.testCases.length) {
          reply.code(400);
          return { error: 'Test case ids must be unique' };
        }
      }

      const item = createItem<ScenarioTaskItem>({
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
