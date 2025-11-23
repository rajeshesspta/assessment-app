import { Assessment } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';

export interface AssessmentRepository {
  save(assessment: Assessment): Assessment;
  getById(tenantId: string, id: string): Assessment | undefined;
}

export function createInMemoryAssessmentRepository(): AssessmentRepository {
  const store = new Map<string, Assessment>();
  const keyOf = (tenantId: string, id: string) => `${tenantId}::${id}`;
  return {
    save(assessment) {
      store.set(keyOf(assessment.tenantId, assessment.id), assessment);
      return assessment;
    },
    getById(tenantId, id) {
      return store.get(keyOf(tenantId, id));
    },
  };
}

export function createSQLiteAssessmentRepository(client: SQLiteTenantClient): AssessmentRepository {
  return {
    save(assessment) {
      const db = client.getConnection(assessment.tenantId);
      db.prepare(`
        INSERT INTO assessments (id, tenant_id, title, item_ids_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          item_ids_json = excluded.item_ids_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        assessment.id,
        assessment.tenantId,
        assessment.title,
        JSON.stringify(assessment.itemIds),
        assessment.createdAt,
        assessment.updatedAt,
      );
      return assessment;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, title, item_ids_json as itemIdsJson, created_at as createdAt, updated_at as updatedAt
        FROM assessments
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId);
      if (!row) {
        return undefined;
      }
      const assessment: Assessment = {
        id: row.id,
        tenantId: row.tenantId,
        title: row.title,
        itemIds: JSON.parse(row.itemIdsJson) as Assessment['itemIds'],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      return assessment;
    },
  };
}
