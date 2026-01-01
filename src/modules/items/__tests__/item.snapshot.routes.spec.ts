import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { registerSnapshotRoutes } from '../item.snapshot.routes.js';
import { createInMemoryItemSnapshotRepository } from '../item.snapshot.repository.js';
import { createInMemoryItemRepository } from '../item.repository.js';
import { createInMemoryAssessmentRepository } from '../../assessments/assessment.repository.js';

const tenantId = 'tenant-test';

function baseHeaders(overrides?: Record<string, string>) {
  return {
    'x-tenant-id': tenantId,
    'x-actor-roles': 'TENANT_ADMIN',
    'x-user-id': 'user-1',
    'x-actor-id': 'user-1',
    ...overrides,
  } satisfies Record<string, string>;
}

describe('snapshot routes', () => {
  let app: ReturnType<typeof Fastify>;
  let snapshotRepo: ReturnType<typeof createInMemoryItemSnapshotRepository>;
  let itemRepo: ReturnType<typeof createInMemoryItemRepository>;
  let assessmentRepo: ReturnType<typeof createInMemoryAssessmentRepository>;

  beforeEach(async () => {
    app = Fastify();
    snapshotRepo = createInMemoryItemSnapshotRepository();
    itemRepo = createInMemoryItemRepository();
    assessmentRepo = createInMemoryAssessmentRepository();
    app.addHook('preHandler', (req, _reply, done) => {
      (req as any).tenantId = req.headers['x-tenant-id'];
      const rolesHeader = (req.headers['x-actor-roles'] as string | undefined) ?? '';
      const roles = rolesHeader
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);
      (req as any).actorRoles = roles.length ? roles : ['TENANT_ADMIN'];
      (req as any).isSuperAdmin = roles.includes('SUPER_ADMIN');
      (req as any).actorId = req.headers['x-actor-id'];
      (req as any).userId = req.headers['x-user-id'];
      done();
    });
    await app.register((instance, _opts, done) => {
      registerSnapshotRoutes(instance as any, {
        repository: snapshotRepo as any,
        itemRepository: itemRepo as any,
        assessmentRepository: assessmentRepo as any,
      }).then(() => done()).catch(done);
    }, { prefix: '/snapshots' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  test('resnapshot creates immutable copies and updates assessment', async () => {
    const now = new Date().toISOString();
    const item = { id: 'item-1', tenantId, prompt: 'Prompt', kind: 'MCQ', createdAt: now, updatedAt: now } as any;
    itemRepo.save(item);
    const assessment = { id: 'assessment-1', tenantId, title: 'Assessment', itemIds: [item.id], allowedAttempts: 1, createdAt: now, updatedAt: now } as any;
    assessmentRepo.save(assessment);

    const res = await app.inject({
      method: 'POST',
      url: `/snapshots/assessment/${assessment.id}/resnapshot`,
      headers: baseHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.snapshotIds).toHaveLength(1);
    const updatedAssessment = assessmentRepo.getById(tenantId, assessment.id)!;
    expect(updatedAssessment.itemSnapshotIds).toHaveLength(1);
  });

  test('retention enforcement trims surplus snapshots per item', async () => {
    const timestamps = [0, 1, 2].map(offset => new Date(Date.now() - offset * 1000).toISOString());
    timestamps.forEach((time, idx) => {
      snapshotRepo.save({
        id: `snap-${idx}`,
        tenantId,
        originalItemId: 'item-1',
        snapshotJson: {},
        createdAt: time,
        updatedAt: time,
      } as any);
    });

    const res = await app.inject({
      method: 'POST',
      url: '/snapshots/retention/enforce',
      headers: baseHeaders(),
      payload: { maxSnapshotsPerItem: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.removed).toBe(1);
    expect(snapshotRepo.listByTenant(tenantId)).toHaveLength(2);
  });

  test('reports summary surfaces aggregate metrics with item metadata', async () => {
    const time = new Date().toISOString();
    const item = { id: 'item-2', tenantId, prompt: 'Sample prompt', kind: 'MCQ', createdAt: time, updatedAt: time } as any;
    itemRepo.save(item);
    snapshotRepo.save({ id: 'snap-1', tenantId, originalItemId: item.id, snapshotJson: {}, createdAt: time, updatedAt: time } as any);
    const res = await app.inject({
      method: 'GET',
      url: '/snapshots/reports/summary',
      headers: baseHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalSnapshots).toBe(1);
    expect(body.uniqueItems).toBe(1);
    expect(body.perItem[0].originalItemId).toBe(item.id);
    expect(body.perItem[0].itemTitle).toBe('Sample prompt');
    expect(body.perItem[0].itemKind).toBe('MCQ');
  });

  test('prune validates payload shape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/snapshots/prune',
      headers: baseHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  test('super admins cannot manage tenant snapshots', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/snapshots/reports/summary',
      headers: baseHeaders({ 'x-actor-roles': 'SUPER_ADMIN' }),
    });
    expect(res.statusCode).toBe(403);
  });
});
