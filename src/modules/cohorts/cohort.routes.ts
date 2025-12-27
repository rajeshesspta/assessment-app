import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { CohortRepository } from './cohort.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type { AssessmentRepository } from '../assessments/assessment.repository.js';
import type { UserRole, Cohort, CohortAssignment } from '../../common/types.js';
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

function ensureLearnerAccess(request: any, reply: FastifyReply, targetUserId: string): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  const roles: UserRole[] = (request.actorRoles as UserRole[] | undefined) ?? [];
  
  // Cohort managers can access any user's data
  if (COHORT_MANAGER_ROLES.some(role => roles.includes(role))) {
    return true;
  }
  
  // Learners can only access their own data
  if (roles.includes('LEARNER')) {
    // For now, allow learners to access cohort data
    // In a real implementation, you'd check if the request user ID matches targetUserId
    return true;
  }
  
  reply.code(403);
  reply.send({ error: 'Forbidden' });
  return false;
}

async function validateLearnerIds(
  tenantId: string,
  learnerIds: string[] | undefined,
  userRepository: UserRepository,
): Promise<{ validated: string[] } | { error: string }> {
  if (!learnerIds || learnerIds.length === 0) {
    return { validated: [] };
  }
  const validated: string[] = [];
  for (const rawId of learnerIds) {
    const id = rawId.trim();
    if (!id) {
      continue;
    }
    const user = await userRepository.getById(tenantId, id);
    if (!user) {
      return { error: `Learner ${id} does not exist` };
    }
    if (!user.roles?.includes('LEARNER')) {
      return { error: `User ${id} is not a learner` };
    }
    if (!validated.includes(id)) {
      validated.push(id);
    }
  }
  if (!validated.length) {
    return { error: 'Cohort must include at least one learner' };
  }
  return { validated };
}

async function validateAssessmentIds(
  tenantId: string,
  assessmentIds: string[] | undefined,
  assessmentRepository: AssessmentRepository,
): Promise<{ validated: string[] } | { error: string }> {
  if (!assessmentIds || assessmentIds.length === 0) {
    return { validated: [] };
  }
  const validated: string[] = [];
  for (const rawId of assessmentIds) {
    const id = rawId.trim();
    if (!id) {
      continue;
    }
    const assessment = await assessmentRepository.getById(tenantId, id);
    if (!assessment) {
      return { error: `Assessment ${id} does not exist` };
    }
    if (!validated.includes(id)) {
      validated.push(id);
    }
  }
  return { validated };
}

function mergeAssignments(existing: CohortAssignment[], updates: CohortAssignment[]): CohortAssignment[] {
  const map = new Map(existing.map(a => [a.assessmentId, a]));
  for (const update of updates) {
    const existingAssignment = map.get(update.assessmentId);
    if (existingAssignment) {
      // Merge: keep existing values if update is undefined
      map.set(update.assessmentId, {
        ...existingAssignment,
        ...update,
        availableFrom: update.availableFrom ?? existingAssignment.availableFrom,
        dueDate: update.dueDate ?? existingAssignment.dueDate,
        allowedAttempts: update.allowedAttempts ?? existingAssignment.allowedAttempts,
      });
    } else {
      map.set(update.assessmentId, update);
    }
  }
  return Array.from(map.values());
}

const createCohortSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  learnerIds: z.array(z.string().min(1)).nonempty(),
  assessmentIds: z.array(z.string().min(1)).optional(),
  assignments: z
    .array(
      z.object({
        assessmentId: z.string().min(1),
        allowedAttempts: z.number().int().min(1).max(100).optional(),
        availableFrom: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    )
    .optional(),
});

const createCohortBodySchema = toJsonSchema(createCohortSchema, 'CreateCohortRequest');

const updateCohortSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  learnerIds: z.array(z.string().min(1)).optional(),
  assessmentIds: z.array(z.string().min(1)).optional(),
  assignments: z
    .array(
      z.object({
        assessmentId: z.string().min(1),
        allowedAttempts: z.number().int().min(1).max(100).optional(),
        availableFrom: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    )
    .optional(),
});

const updateCohortBodySchema = toJsonSchema(updateCohortSchema, 'UpdateCohortRequest');

const assignAssessmentsSchema = z.object({
  assessmentIds: z.array(z.string().min(1)).optional(),
  assignments: z
    .array(
      z.object({
        assessmentId: z.string().min(1),
        allowedAttempts: z.number().int().min(1).max(100).optional(),
        availableFrom: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    )
    .optional(),
}).refine(data => data.assessmentIds || data.assignments, {
  message: 'Either assessmentIds or assignments must be provided',
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
      return reply.code(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    const learnerValidation = await validateLearnerIds(tenantId, parsed.data.learnerIds, userRepository);
    if ('error' in learnerValidation) {
      return reply.code(400).send({ error: learnerValidation.error });
    }
    const learnerIds = learnerValidation.validated;

    const assessmentValidation = await validateAssessmentIds(tenantId, parsed.data.assessmentIds, assessmentRepository);
    if ('error' in assessmentValidation) {
      return reply.code(400).send({ error: assessmentValidation.error });
    }
    const assessmentIds = assessmentValidation.validated;

    const assignments = parsed.data.assignments;
    if (assignments) {
      for (const assignment of assignments) {
        const assessment = await assessmentRepository.getById(tenantId, assignment.assessmentId);
        if (!assessment) {
          return reply.code(400).send({ error: `Assessment ${assignment.assessmentId} does not exist` });
        }
      }
    }

    const cohort: Cohort = {
      id: '',
      tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      learnerIds,
      assessmentIds,
      assignments,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repository.save(cohort);
    return reply.code(201).send(cohort);
  });

  app.put('/:id', {
    schema: {
      tags: ['Cohorts'],
      summary: 'Update a cohort',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: updateCohortBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (!ensureCohortManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const id = (req.params as any).id as string;
    const cohort = await repository.getById(tenantId, id);
    if (!cohort) {
      return reply.code(404).send({ error: 'Cohort not found' });
    }

    const parsed = updateCohortSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    let learnerIds = cohort.learnerIds;
    if (parsed.data.learnerIds) {
      const validation = await validateLearnerIds(tenantId, parsed.data.learnerIds, userRepository);
      if ('error' in validation) {
        return reply.code(400).send({ error: validation.error });
      }
      learnerIds = validation.validated;
    }

    let assessmentIds = cohort.assessmentIds;
    if (parsed.data.assessmentIds) {
      const validation = await validateAssessmentIds(tenantId, parsed.data.assessmentIds, assessmentRepository);
      if ('error' in validation) {
        return reply.code(400).send({ error: validation.error });
      }
      assessmentIds = validation.validated;
    }

    let mergedAssignments = cohort.assignments;
    if (parsed.data.assignments) {
      mergedAssignments = mergeAssignments(cohort.assignments || [], parsed.data.assignments);
    }

    if (mergedAssignments) {
      for (const assignment of mergedAssignments) {
        const assessment = await assessmentRepository.getById(tenantId, assignment.assessmentId);
        if (!assessment) {
          return reply.code(400).send({ error: `Assessment ${assignment.assessmentId} does not exist` });
        }
      }
    }

    const updated = updateCohort(cohort, {
      name: parsed.data.name,
      description: parsed.data.description,
      learnerIds,
      assessmentIds,
      assignments: mergedAssignments,
    });
    await repository.save(updated);
    return reply.send(updated);
  });

  app.delete('/:id', {
    schema: {
      tags: ['Cohorts'],
      summary: 'Delete a cohort',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    if (!ensureCohortManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const id = (req.params as any).id as string;
    const cohort = await repository.getById(tenantId, id);
    if (!cohort) {
      reply.code(404);
      return { error: 'Cohort not found' };
    }
    await repository.delete(tenantId, id);
    reply.code(204);
    return;
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
    const cohort = await repository.getById(tenantId, id);
    if (!cohort) {
      reply.code(404);
      return { error: 'Cohort not found' };
    }
    const parsed = assignAssessmentsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation error', issues: parsed.error.issues };
    }

    let newAssignments = parsed.data.assignments ?? [];
    if (parsed.data.assessmentIds) {
      const validation = await validateAssessmentIds(tenantId, parsed.data.assessmentIds, assessmentRepository);
      if ('error' in validation) {
        return reply.code(400).send({ error: validation.error });
      }
      newAssignments = [...newAssignments, ...validation.validated.map(id => ({ assessmentId: id }))];
    }

    for (const assignment of newAssignments) {
      const assessment = await assessmentRepository.getById(tenantId, assignment.assessmentId);
      if (!assessment) {
        return reply.code(400).send({ error: `Assessment ${assignment.assessmentId} does not exist` });
      }
    }

    const existingAssignments = cohort.assignments ?? cohort.assessmentIds.map(id => ({ assessmentId: id }));
    const assignmentMap = new Map(existingAssignments.map(a => [a.assessmentId, a]));
    for (const a of newAssignments) {
      const existing = assignmentMap.get(a.assessmentId);
      assignmentMap.set(a.assessmentId, {
        ...existing,
        ...a,
      });
    }

    const updated = updateCohort(cohort, { assignments: Array.from(assignmentMap.values()) });
    await repository.save(updated);
    return reply.send(updated);
  });

  app.post('/assignments/users/:userId', {
    schema: {
      tags: ['Cohorts'],
      summary: 'Assign assessments to a user directly',
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string' } },
      },
      body: assignAssessmentsBodySchema,
    },
    attachValidation: true,
    validatorCompiler: passThroughValidator,
  }, async (req, reply) => {
    if (!ensureCohortManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const userId = (req.params as any).userId as string;

    const user = await userRepository.getById(tenantId, userId);
    if (!user) {
      return reply.code(400).send({ error: 'User not found' });
    }
    if (!user.roles?.includes('LEARNER')) {
      return reply.code(400).send({ error: 'User is not a learner' });
    }

    const parsed = assignAssessmentsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }

    let newAssignments = parsed.data.assignments ?? [];
    if (parsed.data.assessmentIds) {
      const validation = await validateAssessmentIds(tenantId, parsed.data.assessmentIds, assessmentRepository);
      if ('error' in validation) {
        return reply.code(400).send({ error: validation.error });
      }
      newAssignments = [...newAssignments, ...validation.validated.map(id => ({ assessmentId: id }))];
    }

    for (const assignment of newAssignments) {
      const assessment = await assessmentRepository.getById(tenantId, assignment.assessmentId);
      if (!assessment) {
        return reply.code(400).send({ error: `Assessment ${assignment.assessmentId} does not exist` });
      }
    }

    const cohorts = await repository.listByLearner(tenantId, userId);
    let personalCohort = cohorts.find(c => c.name === `Personal: ${userId}`);

    if (!personalCohort) {
      personalCohort = createCohort({
        tenantId,
        name: `Personal: ${userId}`,
        description: `Direct assignments for ${user.displayName || user.email}`,
        learnerIds: [userId],
        assignments: newAssignments,
      });
    } else {
      const existingAssignments = personalCohort.assignments ?? personalCohort.assessmentIds.map(id => ({ assessmentId: id }));
      const assignmentMap = new Map(existingAssignments.map(a => [a.assessmentId, a]));
      for (const a of newAssignments) {
        const existing = assignmentMap.get(a.assessmentId);
        assignmentMap.set(a.assessmentId, {
          ...existing,
          ...a,
        });
      }
      personalCohort = updateCohort(personalCohort, { assignments: Array.from(assignmentMap.values()) });
    }

    await repository.save(personalCohort);
    return reply.send(personalCohort);
  });

  app.get('/learner/:userId', async (req, reply) => {
    let userId = (req.params as any).userId as string;
    const authenticatedUserId = (req as any).userId;

    // If the authenticated user is a learner, they can only see their own cohorts.
    // We use the authenticated userId (which is already resolved to UUID) to be safe.
    const roles: UserRole[] = (req as any).actorRoles ?? [];
    if (roles.includes('LEARNER') && authenticatedUserId) {
      userId = authenticatedUserId;
    }

    if (!ensureLearnerAccess(req, reply, userId)) return;
    const tenantId = (req as any).tenantId as string;
    return await repository.listByLearner(tenantId, userId);
  });
}
