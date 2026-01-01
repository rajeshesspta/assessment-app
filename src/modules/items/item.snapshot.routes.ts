import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Item, UserRole } from '../../common/types.js';
import type { ItemSnapshotRepository } from './item.snapshot.repository.js';
import type { ItemRepository } from './item.repository.js';
import type { AssessmentRepository } from '../assessments/assessment.repository.js';

export interface SnapshotRoutesOptions {
  repository: ItemSnapshotRepository;
  itemRepository: ItemRepository;
  assessmentRepository: AssessmentRepository;
}

const SNAPSHOT_MANAGER_ROLES: UserRole[] = ['CONTENT_AUTHOR', 'TENANT_ADMIN'];

const pruneSchema = z.object({
  olderThan: z.string().datetime({ offset: true, message: 'ISO timestamp required' }),
});

const retentionSchema = z.object({
  olderThanDays: z.number().int().min(1).max(3650).optional(),
  maxSnapshotsPerItem: z.number().int().min(1).max(100).optional(),
}).refine(data => data.olderThanDays || data.maxSnapshotsPerItem, {
  message: 'Provide olderThanDays and/or maxSnapshotsPerItem',
});

function ensureSnapshotManager(request: any, reply: FastifyReply): boolean {
  if (request.isSuperAdmin) {
    reply.code(403).send({ error: 'Forbidden' });
    return false;
  }
  const roles: UserRole[] = (request.actorRoles as UserRole[] | undefined) ?? [];
  if (!SNAPSHOT_MANAGER_ROLES.some(role => roles.includes(role))) {
    reply.code(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

function toSnapshotMeta(snapshot: any) {
  return {
    id: snapshot.id,
    originalItemId: snapshot.originalItemId,
    createdAt: snapshot.createdAt,
    createdBy: snapshot.createdBy,
    itemVersion: snapshot.itemVersion,
  };
}

function summarizeSnapshots(allSnapshots: ReturnType<ItemSnapshotRepository['listByTenant']>) {
  const byItem = new Map<string, { originalItemId: string; count: number; newestSnapshotAt?: string; newestSnapshotId?: string; oldestSnapshotAt?: string }>();
  let newestSnapshotAt: string | undefined;
  let oldestSnapshotAt: string | undefined;
  for (const snap of allSnapshots) {
    if (snap.createdAt) {
      if (!newestSnapshotAt || snap.createdAt > newestSnapshotAt) newestSnapshotAt = snap.createdAt;
      if (!oldestSnapshotAt || snap.createdAt < oldestSnapshotAt) oldestSnapshotAt = snap.createdAt;
    }
    const current = byItem.get(snap.originalItemId) ?? { originalItemId: snap.originalItemId, count: 0 };
    current.count += 1;
    if (!current.newestSnapshotAt || (snap.createdAt && snap.createdAt > current.newestSnapshotAt)) {
      current.newestSnapshotAt = snap.createdAt;
      current.newestSnapshotId = snap.id;
    }
    if (!current.oldestSnapshotAt || (snap.createdAt && snap.createdAt < current.oldestSnapshotAt)) {
      current.oldestSnapshotAt = snap.createdAt;
    }
    byItem.set(snap.originalItemId, current);
  }
  const perItem = Array.from(byItem.values()).sort((a, b) => (b.newestSnapshotAt || '').localeCompare(a.newestSnapshotAt || ''));
  return { newestSnapshotAt, oldestSnapshotAt, perItem };
}

function pickItemTitle(item?: Item) {
  if (!item) return undefined;
  const candidate = item.metadata?.title || item.prompt || undefined;
  if (!candidate) return undefined;
  return candidate.length > 240 ? `${candidate.slice(0, 240)}…` : candidate;
}

function reconcileAssessmentSnapshotRefs(
  tenantId: string,
  repository: ItemSnapshotRepository,
  assessmentRepository: AssessmentRepository,
) {
  const validSnapshotIds = new Set(repository.listByTenant(tenantId).map(snapshot => snapshot.id));
  const assessments = assessmentRepository.list(tenantId);
  let updated = 0;
  for (const assessment of assessments) {
    if (!assessment.itemSnapshotIds) continue;
    const filtered = assessment.itemSnapshotIds.filter(id => id && validSnapshotIds.has(id));
    if (filtered.length !== assessment.itemSnapshotIds.length) {
      assessmentRepository.save({
        ...assessment,
        itemSnapshotIds: filtered,
        updatedAt: new Date().toISOString(),
      });
      updated += 1;
    }
  }
  return updated;
}

export async function registerSnapshotRoutes(app: FastifyInstance, options: SnapshotRoutesOptions) {
  const { repository, itemRepository, assessmentRepository } = options;

  app.get('/reports/summary', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const snapshots = repository.listByTenant(tenantId);
    const { newestSnapshotAt, oldestSnapshotAt, perItem } = summarizeSnapshots(snapshots);
    const annotatedPerItem = perItem.map(entry => {
      const item = itemRepository.getById(tenantId, entry.originalItemId);
      return {
        ...entry,
        itemTitle: pickItemTitle(item),
        itemKind: item?.kind,
      };
    });
    const assessments = assessmentRepository.list(tenantId);
    const assessmentsWithSnapshots = assessments.filter(a => (a.itemSnapshotIds?.length ?? 0) > 0).length;
    const assessmentsMissingSnapshots = assessments.length - assessmentsWithSnapshots;
    return {
      totalSnapshots: snapshots.length,
      uniqueItems: perItem.length,
      newestSnapshotAt,
      oldestSnapshotAt,
      assessmentsWithSnapshots,
      assessmentsMissingSnapshots,
      perItem: annotatedPerItem,
    };
  });

  app.get('/reports/original/:itemId', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const itemId = (req.params as any).itemId as string;
    const snapshots = repository.listByOriginalItem(tenantId, itemId);
    return {
      originalItemId: itemId,
      totalSnapshots: snapshots.length,
      snapshots: snapshots.map(toSnapshotMeta),
    };
  });

  // List snapshots for an assessment (by assessment id)
  app.get('/assessment/:assessmentId', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const assessmentId = (req.params as any).assessmentId as string;
    const assessment = assessmentRepository.getById(tenantId, assessmentId);
    if (!assessment) { reply.code(404); return { error: 'Assessment not found' }; }
    const ids = assessment.itemSnapshotIds ?? [];
    const snaps = ids.map(id => repository.getById(tenantId, id)).filter(Boolean);
    return snaps;
  });

  // Resnapshot an assessment: create fresh snapshots for current item definitions
  app.post('/assessment/:assessmentId/resnapshot', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const actorId = (req as any).actorId as string | undefined;
    const assessmentId = (req.params as any).assessmentId as string;
    const assessment = assessmentRepository.getById(tenantId, assessmentId);
    if (!assessment) { reply.code(404); return { error: 'Assessment not found' }; }
    if (!Array.isArray(assessment.itemIds) || assessment.itemIds.length === 0) {
      reply.code(400); return { error: 'Assessment has no itemIds to snapshot' };
    }
    const newSnapshotIds: string[] = [];
    for (const itemId of assessment.itemIds) {
      const item = itemRepository.getById(tenantId, itemId);
      if (!item) continue;
      const snapshot = {
        tenantId,
        originalItemId: item.id,
        itemVersion: (item as any).version ?? undefined,
        snapshotJson: item,
        createdBy: actorId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;
      const saved = repository.save(snapshot);
      newSnapshotIds.push(saved.id);
    }
    // persist updated assessment snapshot refs
    const updated = { ...assessment, itemSnapshotIds: newSnapshotIds, updatedAt: new Date().toISOString() };
    assessmentRepository.save(updated as any);
    return { snapshotIds: newSnapshotIds };
  });

  app.delete('/assessment/:assessmentId/snapshots', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const assessmentId = (req.params as any).assessmentId as string;
    const assessment = assessmentRepository.getById(tenantId, assessmentId);
    if (!assessment) {
      reply.code(404);
      return { error: 'Assessment not found' };
    }
    const snapshotIds = assessment.itemSnapshotIds ?? [];
    let removed = 0;
    for (const id of snapshotIds) {
      if (repository.deleteById(tenantId, id)) {
        removed++;
      }
    }
    assessmentRepository.save({
      ...assessment,
      itemSnapshotIds: [],
      updatedAt: new Date().toISOString(),
    } as any);
    return { removed };
  });

  // Get snapshot by id
  app.get('/:id', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const id = (req.params as any).id as string;
    const snap = repository.getById(tenantId, id);
    if (!snap) { reply.code(404); return { error: 'Not found' }; }
    return snap;
  });

  // Delete a single snapshot
  app.delete('/:id', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const tenantId = (req as any).tenantId as string;
    const id = (req.params as any).id as string;
    const ok = repository.deleteById(tenantId, id);
    if (!ok) { reply.code(404); return { error: 'Not found' }; }
    const assessmentsUpdated = reconcileAssessmentSnapshotRefs(tenantId, repository, assessmentRepository);
    return { deleted: id, assessmentsUpdated };
  });

  // Prune snapshots older than a given ISO date (body: { olderThan: string })
  app.post('/prune', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const parsed = pruneSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation error', issues: parsed.error.issues };
    }
    const tenantId = (req as any).tenantId as string;
    const removed = repository.deleteOlderThan(tenantId, parsed.data.olderThan);
    const assessmentsUpdated = reconcileAssessmentSnapshotRefs(tenantId, repository, assessmentRepository);
    return { removed, assessmentsUpdated };
  });

  app.post('/retention/enforce', async (req, reply) => {
    if (!ensureSnapshotManager(req, reply)) return;
    const parsed = retentionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Validation error', issues: parsed.error.issues };
    }
    const tenantId = (req as any).tenantId as string;
    let removed = 0;
    const { olderThanDays, maxSnapshotsPerItem } = parsed.data;
    if (olderThanDays) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
      removed += repository.deleteOlderThan(tenantId, cutoff);
    }
    if (maxSnapshotsPerItem) {
      const snapshots = repository
        .listByTenant(tenantId)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const seenCounts = new Map<string, number>();
      for (const snap of snapshots) {
        const count = seenCounts.get(snap.originalItemId) ?? 0;
        if (count >= maxSnapshotsPerItem) {
          if (snap.id && repository.deleteById(tenantId, snap.id)) {
            removed += 1;
          }
        } else {
          seenCounts.set(snap.originalItemId, count + 1);
        }
      }
    }
    const assessmentsUpdated = reconcileAssessmentSnapshotRefs(tenantId, repository, assessmentRepository);
    return { removed, assessmentsUpdated };
  });
}
