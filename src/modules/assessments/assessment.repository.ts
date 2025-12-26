import { Assessment } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';

export interface AssessmentRepository {
  save(assessment: Assessment): Assessment;
  getById(tenantId: string, id: string): Assessment | undefined;
  list(tenantId: string): Assessment[];
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
    list(tenantId) {
      return Array.from(store.values()).filter(a => a.tenantId === tenantId);
    },
  };
}

export function createSQLiteAssessmentRepository(client: SQLiteTenantClient): AssessmentRepository {
  return {
    save(assessment) {
      const db = client.getConnection(assessment.tenantId);
      db.prepare(`
        INSERT INTO assessments (id, tenant_id, title, description, item_ids_json, allowed_attempts, time_limit_minutes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          item_ids_json = excluded.item_ids_json,
          allowed_attempts = excluded.allowed_attempts,
          time_limit_minutes = excluded.time_limit_minutes,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        assessment.id,
        assessment.tenantId,
        assessment.title,
        assessment.description || null,
        JSON.stringify(assessment.itemIds),
        assessment.allowedAttempts,
        assessment.timeLimitMinutes || null,
        assessment.createdAt,
        assessment.updatedAt,
      );
      return assessment;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
         SELECT id, tenant_id as tenantId, title, description, item_ids_json as itemIdsJson, allowed_attempts as allowedAttempts,
           time_limit_minutes as timeLimitMinutes, created_at as createdAt, updated_at as updatedAt
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
        description: row.description || undefined,
        itemIds: JSON.parse(row.itemIdsJson) as Assessment['itemIds'],
        allowedAttempts: row.allowedAttempts ?? 1,
        timeLimitMinutes: row.timeLimitMinutes || undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      return assessment;
    },
    list(tenantId) {
      const db = client.getConnection(tenantId);
      const rows = db.prepare(`
        SELECT id, tenant_id as tenantId, title, description, item_ids_json as itemIdsJson, allowed_attempts as allowedAttempts,
          time_limit_minutes as timeLimitMinutes, created_at as createdAt, updated_at as updatedAt
        FROM assessments
        WHERE tenant_id = ?
        ORDER BY created_at DESC
      `).all(tenantId);
      return rows.map(row => ({
        id: row.id,
        tenantId: row.tenantId,
        title: row.title,
        description: row.description || undefined,
        itemIds: JSON.parse(row.itemIdsJson) as Assessment['itemIds'],
        allowedAttempts: row.allowedAttempts ?? 1,
        timeLimitMinutes: row.timeLimitMinutes || undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },
  };
}
