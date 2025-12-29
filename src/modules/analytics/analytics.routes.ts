import { FastifyInstance, FastifyReply } from 'fastify';
import type { AttemptRepository } from '../attempts/attempt.repository.js';
import type { ItemRepository } from '../items/item.repository.js';
import type { UserRole } from '../../common/types.js';

export interface AnalyticsRoutesOptions {
  attemptRepository: AttemptRepository;
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

export async function analyticsRoutes(app: FastifyInstance, options: AnalyticsRoutesOptions) {
  const { attemptRepository, itemRepository } = options;
  app.get('/assessments/:id', async (req, reply) => {
    if (!ensureAnalyticsAccess(req, reply)) return;
    const assessmentId = (req.params as any).id as string;
    const tenantId = (req as any).tenantId as string;
    const attempts = attemptRepository.listByAssessment(tenantId, assessmentId).filter(a => a.status === 'scored');
    const count = attempts.length;
    const avg = count === 0 ? 0 : attempts.reduce((acc: number, a: any) => acc + (a.score ?? 0), 0) / count;
    return { assessmentId, attemptCount: count, averageScore: avg };
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
