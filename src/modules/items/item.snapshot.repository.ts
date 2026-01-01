import { v4 as uuid } from 'uuid';
import type { ItemSnapshot } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';

export interface ItemSnapshotRepository {
  save(snapshot: ItemSnapshot): ItemSnapshot;
  getById(tenantId: string, id: string): ItemSnapshot | undefined;
  deleteById(tenantId: string, id: string): boolean;
  listByTenant(tenantId: string): ItemSnapshot[];
  listByOriginalItem(tenantId: string, originalItemId: string): ItemSnapshot[];
  deleteOlderThan(tenantId: string, isoDate: string): number;
}

export function createInMemoryItemSnapshotRepository(): ItemSnapshotRepository {
  const store = new Map<string, ItemSnapshot>();
  const keyOf = (tenantId: string, id: string) => `${tenantId}::${id}`;
  return {
    save(snapshot) {
      const s = { ...snapshot };
      if (!s.id) s.id = uuid();
      store.set(keyOf(s.tenantId, s.id), s);
      return s;
    },
    getById(tenantId, id) {
      return store.get(keyOf(tenantId, id));
    },
    deleteById(tenantId, id) {
      return store.delete(keyOf(tenantId, id));
    },
    listByTenant(tenantId) {
      const prefix = `${tenantId}::`;
      const items: ItemSnapshot[] = [];
      for (const [k, v] of store.entries()) {
        if (k.startsWith(prefix)) items.push(v);
      }
      return items;
    },
    listByOriginalItem(tenantId, originalItemId) {
      const snapshots: ItemSnapshot[] = [];
      for (const snapshot of store.values()) {
        if (snapshot.tenantId !== tenantId) continue;
        if (snapshot.originalItemId !== originalItemId) continue;
        snapshots.push(snapshot);
      }
      return snapshots.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    deleteOlderThan(tenantId, isoDate) {
      const cutoff = new Date(isoDate).toISOString();
      let removed = 0;
      for (const [k, v] of store.entries()) {
        if (k.startsWith(`${tenantId}::`) && v.createdAt && v.createdAt < cutoff) {
          store.delete(k);
          removed++;
        }
      }
      return removed;
    },
  };
}

export function createSQLiteItemSnapshotRepository(client: SQLiteTenantClient): ItemSnapshotRepository {
  return {
    save(snapshot) {
      const db = client.getConnection(snapshot.tenantId);
      const id = snapshot.id || uuid();
      db.prepare(`
        INSERT INTO item_snapshots (id, tenant_id, original_item_id, item_version, snapshot_json, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          original_item_id = excluded.original_item_id,
          item_version = excluded.item_version,
          snapshot_json = excluded.snapshot_json,
          created_by = excluded.created_by,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        id,
        snapshot.tenantId,
        snapshot.originalItemId,
        snapshot.itemVersion || null,
        JSON.stringify(snapshot.snapshotJson || {}),
        snapshot.createdBy || null,
        snapshot.createdAt,
        snapshot.updatedAt,
      );
      return { ...snapshot, id };
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, original_item_id as originalItemId, item_version as itemVersion, snapshot_json as snapshotJson, created_by as createdBy, created_at as createdAt, updated_at as updatedAt
        FROM item_snapshots
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId);
      if (!row) return undefined;
      return {
        id: row.id,
        tenantId: row.tenantId,
        originalItemId: row.originalItemId,
        itemVersion: row.itemVersion,
        snapshotJson: JSON.parse(row.snapshotJson || '{}'),
        createdBy: row.createdBy || undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } as ItemSnapshot;
    },
    deleteById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const exists = db
        .prepare(`SELECT 1 as one FROM item_snapshots WHERE id = ? AND tenant_id = ?`)
        .get(id, tenantId);
      if (!exists) {
        return false;
      }
      db.prepare(`DELETE FROM item_snapshots WHERE id = ? AND tenant_id = ?`).run(id, tenantId);
      return true;
    },
    listByTenant(tenantId) {
      const db = client.getConnection(tenantId);
      const rows = db.prepare(`
        SELECT id, tenant_id as tenantId, original_item_id as originalItemId, item_version as itemVersion, snapshot_json as snapshotJson, created_by as createdBy, created_at as createdAt, updated_at as updatedAt
        FROM item_snapshots
        WHERE tenant_id = ?
        ORDER BY created_at DESC
      `).all(tenantId) as any[];
      return rows.map(row => ({
        id: row.id,
        tenantId: row.tenantId,
        originalItemId: row.originalItemId,
        itemVersion: row.itemVersion,
        snapshotJson: JSON.parse(row.snapshotJson || '{}'),
        createdBy: row.createdBy || undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } as ItemSnapshot));
    },
    listByOriginalItem(tenantId, originalItemId) {
      const db = client.getConnection(tenantId);
      const rows = db.prepare(`
        SELECT id, tenant_id as tenantId, original_item_id as originalItemId, item_version as itemVersion, snapshot_json as snapshotJson, created_by as createdBy, created_at as createdAt, updated_at as updatedAt
        FROM item_snapshots
        WHERE tenant_id = ? AND original_item_id = ?
        ORDER BY created_at DESC
      `).all(tenantId, originalItemId) as any[];
      return rows.map(row => ({
        id: row.id,
        tenantId: row.tenantId,
        originalItemId: row.originalItemId,
        itemVersion: row.itemVersion,
        snapshotJson: JSON.parse(row.snapshotJson || '{}'),
        createdBy: row.createdBy || undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } as ItemSnapshot));
    },
    deleteOlderThan(tenantId, isoDate) {
      const db = client.getConnection(tenantId);
      const countRow = db
        .prepare(`SELECT COUNT(*) as count FROM item_snapshots WHERE tenant_id = ? AND created_at < ?`)
        .get(tenantId, isoDate) as { count?: number };
      db.prepare(`DELETE FROM item_snapshots WHERE tenant_id = ? AND created_at < ?`).run(tenantId, isoDate);
      return countRow?.count ?? 0;
    },
  };
}
