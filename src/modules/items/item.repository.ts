import { Item } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';

export interface ItemRepository {
  save(item: Item): Item;
  getById(tenantId: string, id: string): Item | undefined;
}

export function createInMemoryItemRepository(): ItemRepository {
  const store = new Map<string, Item>();
  const keyOf = (tenantId: string, id: string) => `${tenantId}::${id}`;
  return {
    save(item) {
      store.set(keyOf(item.tenantId, item.id), item);
      return item;
    },
    getById(tenantId, id) {
      return store.get(keyOf(tenantId, id));
    },
  };
}

export function createSQLiteItemRepository(client: SQLiteTenantClient): ItemRepository {
  return {
    save(item) {
      const db = client.getConnection(item.tenantId);
      db.prepare(`
        INSERT INTO items (id, tenant_id, kind, prompt, choices_json, correct_index, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          prompt = excluded.prompt,
          choices_json = excluded.choices_json,
          correct_index = excluded.correct_index,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        item.id,
        item.tenantId,
        item.kind,
        item.prompt,
        JSON.stringify(item.choices),
        item.correctIndex,
        item.createdAt,
        item.updatedAt,
      );
      return item;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, correct_index as correctIndex, created_at as createdAt, updated_at as updatedAt
        FROM items
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId);
      if (!row) {
        return undefined;
      }
      const choices = JSON.parse(row.choicesJson) as Item['choices'];
      const item: Item = {
        id: row.id,
        tenantId: row.tenantId,
        kind: row.kind as Item['kind'],
        prompt: row.prompt,
        choices,
        correctIndex: row.correctIndex,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      return item;
    },
  };
}
