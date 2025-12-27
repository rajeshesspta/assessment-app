import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { createAssessment } from './assessment.model.js';
import type { AssessmentRepository } from './assessment.repository.js';
import type { CohortRepository } from '../cohorts/cohort.repository.js';
import { eventBus } from '../../common/event-bus.js';
import { toJsonSchema } from '../../common/zod-json-schema.js';
import { passThroughValidator } from '../../common/fastify-schema.js';
import type { UserRole, Assessment } from '../../common/types.js';

const ASSESSMENT_MANAGER_ROLES: UserRole[] = ['CONTENT_AUTHOR', 'TENANT_ADMIN'];

function ensureAssessmentManager(request: any, reply: FastifyReply): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  const roles: UserRole[] = (request.actorRoles as UserRole[] | undefined) ?? [];
  if (ASSESSMENT_MANAGER_ROLES.some(role => roles.includes(role))) {
    return true;
  }
  reply.code(403);
  reply.send({ error: 'Forbidden' });
  return false;
}

function ensureCanAccessAssessment(request: any, reply: FastifyReply, assessmentId: string, cohortRepository: CohortRepository): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  const roles: UserRole[] = (request.actorRoles as UserRole[] | undefined) ?? [];
  const tenantId = (request as any).tenantId as string;
  const userId = (request as any).userId as string;

  // Assessment managers can access any assessment
  if (ASSESSMENT_MANAGER_ROLES.some(role => roles.includes(role))) {
    return true;
  }

  // Learners can access assessments they're assigned to
  if (roles.includes('LEARNER')) {
    const learnerCohorts = cohortRepository.listByLearner(tenantId, userId);
    const isAssigned = learnerCohorts.some(cohort => 
      cohort.assessmentIds?.includes(assessmentId) || 
      cohort.assignments?.some(a => a.assessmentId === assessmentId)
    );
    if (isAssigned) {
      return true;
    }
  }

  reply.code(403);
  reply.send({ error: 'Forbidden' });
  return false;
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  collectionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  itemIds: z.array(z.string()).min(1),
  allowedAttempts: z.number().int().min(1).max(100).optional(),
  timeLimitMinutes: z.number().int().min(1).optional(),
});

const createAssessmentBodySchema = toJsonSchema(createSchema, 'CreateAssessmentRequest');

export interface AssessmentRoutesOptions {
  repository: AssessmentRepository;
  cohortRepository: CohortRepository;
}

export async function assessmentRoutes(app: FastifyInstance, options: AssessmentRoutesOptions) {
  const { repository, cohortRepository } = options;

  app.get('/', {
    schema: {
      tags: ['Assessments'],
      summary: 'List assessments',
    }
  }, async (req, reply) => {
    if (!ensureAssessmentManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    return repository.list(tenantId);
  });

  app.post('/', {
    schema: {
      tags: ['Assessments'],
      summary: 'Create an assessment',
      body: createAssessmentBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (!ensureAssessmentManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const parsed = createSchema.parse(req.body);
    const id = uuid();
    const assessment = createAssessment({ id, tenantId, ...parsed });
    repository.save(assessment);
    eventBus.publish({ id: uuid(), type: 'AssessmentCreated', occurredAt: new Date().toISOString(), tenantId, payload: { assessmentId: id } });
    reply.code(201);
    return assessment;
  });

  app.put('/:id', {
    schema: {
      tags: ['Assessments'],
      summary: 'Update an assessment',
      body: createAssessmentBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (!ensureAssessmentManager(req, reply)) return;
    const id = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const existing = repository.getById(tenantId, id);
    if (!existing) {
      reply.code(404);
      return { error: 'Not found' };
    }

    const parsed = createSchema.parse(req.body);
    const updated: Assessment = {
      ...existing,
      ...parsed,
      updatedAt: new Date().toISOString(),
    };
    repository.save(updated);
    eventBus.publish({ id: uuid(), type: 'AssessmentUpdated', occurredAt: new Date().toISOString(), tenantId, payload: { assessmentId: id } });
    return updated;
  });

  app.get('/:id', async (req, reply) => {
    const id = (req.params as any).id as string;
    if (!ensureCanAccessAssessment(req, reply, id, cohortRepository)) return;
    const tenantId = (req as any).tenantId as string;
    const a = repository.getById(tenantId, id);
    if (!a) { reply.code(404); return { error: 'Not found' }; }
    return a;
  });
}
