import { getTenantTaxonomyConfig } from '../../config/tenant-taxonomy.js';
 import { FastifyInstance, FastifyReply } from 'fastify';
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
  Item,
} from '../../common/types.js';
import type { UserRole } from '../../common/types.js';
import { eventBus } from '../../common/event-bus.js';
import { toJsonSchema } from '../../common/zod-json-schema.js';
import { passThroughValidator } from '../../common/fastify-schema.js';

const ITEM_MANAGER_ROLES: UserRole[] = ['CONTENT_AUTHOR', 'TENANT_ADMIN'];

function hasItemManagerRole(request: any): boolean {
  const roles: UserRole[] = (request.actorRoles as UserRole[] | undefined) ?? [];
  return ITEM_MANAGER_ROLES.some(role => roles.includes(role));
}

function ensureItemManager(request: any, reply: FastifyReply): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  if (hasItemManagerRole(request)) {
    return true;
  }
  reply.code(403);
  reply.send({ error: 'Forbidden' });
  return false;
}


// Placeholder
const mcqSchema = z.object({
  kind: z.literal('MCQ'),
  prompt: z.string().min(1),
  choices: z.array(z.object({ text: z.string().min(1) })).min(2),
  answerMode: z.enum(['single', 'multiple']),
  correctIndexes: z.array(z.number().int().nonnegative()).min(1),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

const trueFalseSchema = z.object({
  kind: z.literal('TRUE_FALSE'),
  prompt: z.string().min(1),
  answerIsTrue: z.boolean(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

const shortAnswerSchema = z.object({
  kind: z.literal('SHORT_ANSWER'),
  prompt: z.string().min(1),
  rubric: z
    .object({
      keywords: z.array(z.string().min(1).max(80)).max(10).optional(),
      guidance: z.string().min(1).max(500).optional(),
      sampleAnswer: z.string().min(1).max(1000).optional(),
    })
    .optional(),
  scoring: z
    .object({
      mode: z.enum(['manual', 'ai_rubric']).default('manual'),
      maxScore: z.number().int().positive().max(10).default(1),
      aiEvaluatorId: z.string().min(1).optional(),
    }),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
});

const essaySchema = z.object({
  kind: z.literal('ESSAY'),
  prompt: z.string().min(1),
  length: essayLengthSchema.optional(),
  rubric: z
    .object({
      keywords: z.array(z.string().min(1).max(120)).max(20).optional(),
      guidance: z.string().min(1).max(2000).optional(),
      sampleAnswer: z.string().min(1).max(5000).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const createSchema = z.discriminatedUnion('kind', [
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

const createItemBodySchema = toJsonSchema(createSchema, 'CreateItemRequest');

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
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export interface ItemRoutesOptions {
  repository: ItemRepository;
}

export async function itemRoutes(app: FastifyInstance, options: ItemRoutesOptions) {
  const { repository } = options;
  app.get('/', async (req, reply) => {
    if (!ensureItemManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const { search, limit, offset, kind, categories, tags, metadata } = listQuerySchema.parse(req.query ?? {});
    return repository.list(tenantId, { search, kind, categories, tags, metadata, limit: limit ?? 10, offset: offset ?? 0 });
  });

  // Register POST handler from modular file
  const { registerItemPostRoute } = await import('./routes/item.post.js');
  registerItemPostRoute(app, repository);

  // Register PUT handler from modular file
  const { registerItemPutRoute } = await import('./routes/item.put.js');
  registerItemPutRoute(app, repository);

  app.get('/:id', async (req, reply) => {
    if (!ensureItemManager(req, reply)) return;
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const item = repository.getById(tenantId, id);
    if (!item) { reply.code(404); return { error: 'Not found' }; }
    return item;
  });
}
