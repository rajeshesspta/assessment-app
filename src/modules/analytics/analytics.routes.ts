import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AttemptRepository } from '../attempts/attempt.repository.js';
import type { AssessmentRepository } from '../assessments/assessment.repository.js';
import type { CohortRepository } from '../cohorts/cohort.repository.js';
import type { ItemRepository } from '../items/item.repository.js';
import type { UserRole } from '../../common/types.js';
import type { Attempt, AttemptResponse, Cohort, Item } from '../../common/types.js';
import {
  scoreDragDropItem,
  scoreFillBlankItem,
  scoreHotspotItem,
  scoreMcqItem,
  scoreNumericEntryItem,
  scoreTrueFalseItem,
} from '../scoring/scoring.service.js';

export interface AnalyticsRoutesOptions {
  attemptRepository: AttemptRepository;
  assessmentRepository: AssessmentRepository;
  cohortRepository: CohortRepository;
  itemRepository: ItemRepository;
}

const ANALYTICS_ROLES: UserRole[] = ['TENANT_ADMIN', 'CONTENT_AUTHOR'];

function ensureAnalyticsAccess(request: any, reply: FastifyReply): boolean {
  if (request.isSuperAdmin) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  const roles: UserRole[] = (request.actorRoles as UserRole[] | undefined) ?? [];
  if (!ANALYTICS_ROLES.some(role => roles.includes(role))) {
    reply.code(403);
    reply.send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

function computePercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return value / max;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function bucketizePercents(percents: number[], bucketSize: number): { bucketSize: number; buckets: Record<string, number> } {
  const safeBucket = Number.isFinite(bucketSize) && bucketSize > 0 ? bucketSize : 0.1;
  const buckets: Record<string, number> = {};
  for (const value of percents) {
    const normalized = Math.max(0, Math.min(1, value));
    const bucketStart = Math.min(1 - safeBucket, Math.floor(normalized / safeBucket) * safeBucket);
    const key = `${Math.round(bucketStart * 100)}-${Math.round((bucketStart + safeBucket) * 100)}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return { bucketSize: safeBucket, buckets };
}

function cohortHasAssessment(cohort: Cohort, assessmentId: string): { has: boolean; allowedAttempts?: number } {
  const assignment = cohort.assignments?.find(item => item.assessmentId === assessmentId);
  if (assignment) {
    return { has: true, allowedAttempts: assignment.allowedAttempts };
  }
  if (Array.isArray(cohort.assessmentIds) && cohort.assessmentIds.includes(assessmentId)) {
    return { has: true };
  }
  return { has: false };
}

function scoreResponse(item: Item, response?: AttemptResponse) {
  if (!response) {
    return undefined;
  }
  if (item.kind === 'MCQ') {
    return scoreMcqItem(item, response.answerIndexes);
  }
  if (item.kind === 'TRUE_FALSE') {
    return scoreTrueFalseItem(item, response.answerIndexes);
  }
  if (item.kind === 'FILL_IN_THE_BLANK') {
    return scoreFillBlankItem(item, response.textAnswers);
  }
  if (item.kind === 'NUMERIC_ENTRY') {
    return scoreNumericEntryItem(item, response.numericAnswer);
  }
  if (item.kind === 'HOTSPOT') {
    return scoreHotspotItem(item, response.hotspotAnswers);
  }
  if (item.kind === 'DRAG_AND_DROP') {
    return scoreDragDropItem(item, response.dragDropAnswers);
  }
  // NOTE: Matching/Ordering/Short-answer/Essay/Scenario scoring is handled elsewhere or may be deferred.
  return undefined;
}

export async function analyticsRoutes(app: FastifyInstance, options: AnalyticsRoutesOptions) {
  const { attemptRepository, assessmentRepository, cohortRepository, itemRepository } = options;

  const assessmentIdParamsSchema = z.object({ id: z.string().min(1) });
  const summaryQuerySchema = z.object({
    passThreshold: z.coerce.number().min(0).max(1).optional(),
    bucketSize: z.coerce.number().min(0.01).max(0.5).optional(),
  });
  const mostMissedQuerySchema = z.object({
    limit: z.coerce.number().min(1).max(50).optional(),
  });
  app.get('/assessments/:id', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;
    const assessmentId = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const attempts = attemptRepository.listByAssessment(tenantId, assessmentId).filter(a => a.status === 'scored');
    const count = attempts.length;
    const avg = count === 0 ? 0 : attempts.reduce((acc: number, a: any) => acc + (a.score ?? 0), 0) / count;
    return { assessmentId, attemptCount: count, averageScore: avg };
  });

  // MVP: aggregated assessment analytics.
  app.get('/assessments/:id/summary', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;

    const paramsParsed = assessmentIdParamsSchema.safeParse(req.params ?? {});
    const queryParsed = summaryQuerySchema.safeParse((req as any).query ?? {});
    if (!paramsParsed.success || !queryParsed.success) {
      reply.code(400);
      return { error: 'Invalid request' };
    }

    const tenantId = (req as any).tenantId as string;
    const assessmentId = paramsParsed.data.id;

    const scoredAttempts = attemptRepository
      .listByAssessment(tenantId, assessmentId)
      .filter(attempt => attempt.status === 'scored');

    const percents = scoredAttempts.map(attempt => computePercent(attempt.score ?? 0, attempt.maxScore ?? 0));
    const passThreshold = queryParsed.data.passThreshold ?? 0.7;
    const passedCount = percents.filter(value => value >= passThreshold).length;
    const completionSeconds = scoredAttempts
      .map(attempt => {
        const started = Date.parse(attempt.createdAt);
        const ended = Date.parse(attempt.updatedAt);
        if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
          return undefined;
        }
        return Math.round((ended - started) / 1000);
      })
      .filter((value): value is number => typeof value === 'number');

    return {
      assessmentId,
      scoredAttemptCount: scoredAttempts.length,
      averageScore: scoredAttempts.length === 0 ? 0 : scoredAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / scoredAttempts.length,
      averagePercent: scoredAttempts.length === 0 ? 0 : percents.reduce((sum, value) => sum + value, 0) / percents.length,
      medianPercent: median(percents),
      minPercent: percents.length === 0 ? 0 : Math.min(...percents),
      maxPercent: percents.length === 0 ? 0 : Math.max(...percents),
      passThreshold,
      passRate: scoredAttempts.length === 0 ? 0 : passedCount / scoredAttempts.length,
      distribution: bucketizePercents(percents, queryParsed.data.bucketSize ?? 0.1),
      completionTimeSeconds: {
        count: completionSeconds.length,
        average: completionSeconds.length === 0 ? 0 : completionSeconds.reduce((sum, value) => sum + value, 0) / completionSeconds.length,
        median: median(completionSeconds),
      },
    };
  });

  app.get('/assessments/:id/funnel', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;

    const paramsParsed = assessmentIdParamsSchema.safeParse(req.params ?? {});
    if (!paramsParsed.success) {
      reply.code(400);
      return { error: 'Invalid request' };
    }

    const tenantId = (req as any).tenantId as string;
    const assessmentId = paramsParsed.data.id;

    const cohorts = cohortRepository.list(tenantId);
    const assignedLearners = new Set<string>();
    for (const cohort of cohorts) {
      const match = cohortHasAssessment(cohort, assessmentId);
      if (!match.has) {
        continue;
      }
      for (const learnerId of cohort.learnerIds ?? []) {
        assignedLearners.add(learnerId);
      }
    }

    const attempts = attemptRepository.listByAssessment(tenantId, assessmentId);
    const startedLearners = new Set<string>();
    const submittedLearners = new Set<string>();
    const scoredLearners = new Set<string>();
    for (const attempt of attempts) {
      startedLearners.add(attempt.userId);
      if (attempt.status === 'submitted' || attempt.status === 'scored') {
        submittedLearners.add(attempt.userId);
      }
      if (attempt.status === 'scored') {
        scoredLearners.add(attempt.userId);
      }
    }

    return {
      assessmentId,
      assignedLearnerCount: assignedLearners.size,
      startedLearnerCount: startedLearners.size,
      submittedLearnerCount: submittedLearners.size,
      scoredLearnerCount: scoredLearners.size,
      attemptCount: attempts.length,
    };
  });

  app.get('/assessments/:id/attempts-usage', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;

    const paramsParsed = assessmentIdParamsSchema.safeParse(req.params ?? {});
    if (!paramsParsed.success) {
      reply.code(400);
      return { error: 'Invalid request' };
    }

    const tenantId = (req as any).tenantId as string;
    const assessmentId = paramsParsed.data.id;
    const assessment = assessmentRepository.getById(tenantId, assessmentId);
    if (!assessment) {
      reply.code(404);
      return { error: 'Assessment not found' };
    }

    const cohorts = cohortRepository.list(tenantId);
    const allowedAttemptsByLearner = new Map<string, number>();
    for (const cohort of cohorts) {
      const match = cohortHasAssessment(cohort, assessmentId);
      if (!match.has) {
        continue;
      }
      for (const learnerId of cohort.learnerIds ?? []) {
        const baseline = allowedAttemptsByLearner.get(learnerId) ?? assessment.allowedAttempts;
        const configured = match.allowedAttempts ?? assessment.allowedAttempts;
        // If multiple cohorts assign the same assessment, use the most permissive allowedAttempts.
        allowedAttemptsByLearner.set(learnerId, Math.max(baseline, configured));
      }
    }

    const attempts = attemptRepository.listByAssessment(tenantId, assessmentId);
    const attemptsUsedByLearner = new Map<string, number>();
    for (const attempt of attempts) {
      attemptsUsedByLearner.set(attempt.userId, (attemptsUsedByLearner.get(attempt.userId) ?? 0) + 1);
    }

    const assignedLearners = Array.from(allowedAttemptsByLearner.keys());
    const usage = assignedLearners.map(learnerId => {
      const allowedAttempts = allowedAttemptsByLearner.get(learnerId) ?? assessment.allowedAttempts;
      const used = attemptsUsedByLearner.get(learnerId) ?? 0;
      return { learnerId, allowedAttempts, attemptsUsed: used, exhausted: used >= allowedAttempts };
    });
    const exhaustedCount = usage.filter(item => item.exhausted).length;
    const attemptsUsedList = usage.map(item => item.attemptsUsed);

    return {
      assessmentId,
      assignedLearnerCount: usage.length,
      learnersAttemptedCount: usage.filter(item => item.attemptsUsed > 0).length,
      learnersExhaustedCount: exhaustedCount,
      averageAttemptsUsed: usage.length === 0 ? 0 : attemptsUsedList.reduce((sum, value) => sum + value, 0) / usage.length,
      maxAttemptsUsed: attemptsUsedList.length === 0 ? 0 : Math.max(...attemptsUsedList),
    };
  });

  app.get('/assessments/:id/items/most-missed', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;

    const paramsParsed = assessmentIdParamsSchema.safeParse(req.params ?? {});
    const queryParsed = mostMissedQuerySchema.safeParse((req as any).query ?? {});
    if (!paramsParsed.success || !queryParsed.success) {
      reply.code(400);
      return { error: 'Invalid request' };
    }

    const tenantId = (req as any).tenantId as string;
    const assessmentId = paramsParsed.data.id;
    const assessment = assessmentRepository.getById(tenantId, assessmentId);
    if (!assessment) {
      reply.code(404);
      return { error: 'Assessment not found' };
    }
    const itemIds = assessment.itemIds ?? [];

    const attempts = attemptRepository.listByAssessment(tenantId, assessmentId).filter(attempt => attempt.status === 'scored');
    const responseStats = new Map<string, { attempts: number; perfect: number; averagePercentTotal: number }>();

    for (const attempt of attempts) {
      for (const response of attempt.responses ?? []) {
        if (!response?.itemId) {
          continue;
        }
        const itemId = response.itemId;
        if (itemIds.length > 0 && !itemIds.includes(itemId)) {
          continue;
        }
        const item = itemRepository.getById(tenantId, itemId);
        if (!item) {
          continue;
        }
        const result = scoreResponse(item, response);
        if (!result || result.maxScore <= 0) {
          continue;
        }
        const percent = computePercent(result.score, result.maxScore);
        const stat = responseStats.get(itemId) ?? { attempts: 0, perfect: 0, averagePercentTotal: 0 };
        stat.attempts += 1;
        stat.averagePercentTotal += percent;
        if (percent >= 1) {
          stat.perfect += 1;
        }
        responseStats.set(itemId, stat);
      }
    }

    const scored = Array.from(responseStats.entries()).map(([itemId, stat]) => {
      const averagePercent = stat.attempts === 0 ? 0 : stat.averagePercentTotal / stat.attempts;
      const perfectRate = stat.attempts === 0 ? 0 : stat.perfect / stat.attempts;
      return { itemId, attemptCount: stat.attempts, averagePercent, perfectRate };
    });

    scored.sort((a, b) => a.perfectRate - b.perfectRate);
    const limit = queryParsed.data.limit ?? 10;
    return { assessmentId, items: scored.slice(0, limit) };
  });

  app.get('/items/by-category', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const items = itemRepository.list(tenantId);
    const categoryStats: Record<string, { itemCount: number }> = {};

    for (const item of items) {
      if (item.categories) {
        for (const category of item.categories) {
          if (!categoryStats[category]) {
            categoryStats[category] = { itemCount: 0 };
          }
          categoryStats[category].itemCount += 1;
        }
      }
    }

    return { categories: categoryStats };
  });

  app.get('/items/by-tag', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const items = itemRepository.list(tenantId);
    const tagStats: Record<string, { itemCount: number }> = {};

    for (const item of items) {
      if (item.tags) {
        for (const tag of item.tags) {
          if (!tagStats[tag]) {
            tagStats[tag] = { itemCount: 0 };
          }
          tagStats[tag].itemCount += 1;
        }
      }
    }

    return { tags: tagStats };
  });
}
