import type { ItemRepository } from './item.repository.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';
import type { Item } from '../../common/types.js';

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
    list(tenantId, options = {}) {
      const db = client.getConnection(tenantId);
      const limit = options.limit ?? 10;
      const offset = options.offset ?? 0;
      const search = options.search ? `%${options.search.toLowerCase()}%` : undefined;
      const rows = search
        ? db
            .prepare(`
              SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, correct_index as correctIndex, created_at as createdAt, updated_at as updatedAt
              FROM items
              WHERE tenant_id = ? AND lower(prompt) LIKE ?
              ORDER BY created_at DESC
              LIMIT ? OFFSET ?
            `)
            .all(tenantId, search, limit, offset)
        : db
            .prepare(`
              SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, correct_index as correctIndex, created_at as createdAt, updated_at as updatedAt
              FROM items
              WHERE tenant_id = ?
              ORDER BY created_at DESC
              LIMIT ? OFFSET ?
            `)
            .all(tenantId, limit, offset);
      return rows.map(row => ({
        id: row.id,
        tenantId: row.tenantId,
        kind: row.kind as Item['kind'],
        prompt: row.prompt,
        choices: JSON.parse(row.choicesJson) as Item['choices'],
        correctIndex: row.correctIndex,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies Item));
    },
  };
}
