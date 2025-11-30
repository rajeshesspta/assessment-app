import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { CohortRepository } from './cohort.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type { AssessmentRepository } from '../assessments/assessment.repository.js';
import type { UserRole } from '../../common/types.js';
import { createCohort, updateCohort } from './cohort.model.js';
import { passThroughValidator } from '../../common/fastify-schema.js';
import { toJsonSchema } from '../../common/zod-json-schema.js';

const COHORT_MANAGER_ROLES: UserRole[] = ['CONTENT_AUTHOR', 'TENANT_ADMIN'];

function ensureCohortManager(request: any, reply: FastifyReply): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  const roles: UserRole[] = (request.actorRoles as UserRole[] | undefined) ?? [];
  if (!COHORT_MANAGER_ROLES.some(role => roles.includes(role))) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

function validateLearnerIds(
  tenantId: string,
  learnerIds: string[],
  userRepository: UserRepository,
  reply: FastifyReply,
): string[] | undefined {
  const validated: string[] = [];
  for (const rawId of learnerIds) {
    const id = rawId.trim();
    if (!id) {
      continue;
    }
    const user = userRepository.getById(tenantId, id);
    if (!user) {
      reply.code(400);
      reply.send({ error: `Learner ${id} does not exist` });
      return undefined;
    }
    if (!user.roles.includes('LEARNER')) {
      reply.code(400);
      reply.send({ error: `User ${id} is not a learner` });
      return undefined;
    }
    if (!validated.includes(id)) {
      validated.push(id);
    }
  }
  if (!validated.length) {
    reply.code(400);
    reply.send({ error: 'Cohort must include at least one learner' });
    return undefined;
  }
  return validated;
}

function validateAssessmentIds(
  tenantId: string,
  assessmentIds: string[] | undefined,
  assessmentRepository: AssessmentRepository,
  reply: FastifyReply,
): string[] | undefined {
  if (!assessmentIds || assessmentIds.length === 0) {
    return [];
  }
  const validated: string[] = [];
  for (const rawId of assessmentIds) {
    const id = rawId.trim();
    if (!id) {
      continue;
    }
    const assessment = assessmentRepository.getById(tenantId, id);
    if (!assessment) {
      reply.code(400);
      reply.send({ error: `Assessment ${id} does not exist` });
      return undefined;
    }
    if (!validated.includes(id)) {
      validated.push(id);
    }
  }
  return validated;
}

const createCohortSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  learnerIds: z.array(z.string().min(1)).nonempty(),
  assessmentIds: z.array(z.string().min(1)).optional(),
});

const createCohortBodySchema = toJsonSchema(createCohortSchema, 'CreateCohortRequest');

const assignAssessmentsSchema = z.object({
  assessmentIds: z.array(z.string().min(1)).nonempty(),
});

const assignAssessmentsBodySchema = toJsonSchema(assignAssessmentsSchema, 'AssignCohortAssessmentsRequest');

export interface CohortRoutesOptions {
  repository: CohortRepository;
  userRepository: UserRepository;
  assessmentRepository: AssessmentRepository;
}

export async function cohortRoutes(app: FastifyInstance, options: CohortRoutesOptions) {
  const { repository, userRepository, assessmentRepository } = options;

  app.get('/', async (req, reply) => {
    if (!ensureCohortManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    return repository.list(tenantId);
  });

  app.post('/', {
    schema: {
      tags: ['Cohorts'],
      summary: 'Create a cohort',
      body: createCohortBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (!ensureCohortManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const parsed = createCohortSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation error', issues: parsed.error.issues };
    }
    const learnerIds = validateLearnerIds(tenantId, parsed.data.learnerIds, userRepository, reply);
    if (!learnerIds) return;
    const assessmentIds = validateAssessmentIds(tenantId, parsed.data.assessmentIds, assessmentRepository, reply);
    if (assessmentIds === undefined) return;
    const cohort = createCohort({
      tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      learnerIds,
      assessmentIds,
    });
    const saved = repository.save(cohort);
    reply.code(201);
    return saved;
  });

  app.post('/:id/assessments', {
    schema: {
      tags: ['Cohorts'],
      summary: 'Assign assessments to a cohort',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: assignAssessmentsBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (!ensureCohortManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const id = (req.params as any).id as string;
    const cohort = repository.getById(tenantId, id);
    if (!cohort) {
      reply.code(404);
      return { error: 'Cohort not found' };
    }
    const parsed = assignAssessmentsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation error', issues: parsed.error.issues };
    }
    const newAssessments = validateAssessmentIds(tenantId, parsed.data.assessmentIds, assessmentRepository, reply);
    if (newAssessments === undefined) return;
    const merged = Array.from(new Set([...cohort.assessmentIds, ...newAssessments]));
    const updated = updateCohort(cohort, { assessmentIds: merged });
    const saved = repository.save(updated);
    return saved;
  });
}
