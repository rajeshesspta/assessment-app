import { Attempt } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';

export interface AttemptRepository {
  save(attempt: Attempt): Attempt;
  getById(tenantId: string, id: string): Attempt | undefined;
  listByAssessment(tenantId: string, assessmentId: string): Attempt[];
}

export function createInMemoryAttemptRepository(): AttemptRepository {
  const store = new Map<string, Attempt>();
  const keyOf = (tenantId: string, id: string) => `${tenantId}::${id}`;
  return {
    save(attempt) {
      store.set(keyOf(attempt.tenantId, attempt.id), attempt);
      return attempt;
    },
    getById(tenantId, id) {
      return store.get(keyOf(tenantId, id));
    },
    listByAssessment(tenantId, assessmentId) {
      return Array.from(store.values()).filter(a => a.tenantId === tenantId && a.assessmentId === assessmentId);
    },
  };
}

export function createSQLiteAttemptRepository(client: SQLiteTenantClient): AttemptRepository {
  return {
    save(attempt) {
      const db = client.getConnection(attempt.tenantId);
      db.prepare(`
        INSERT INTO attempts (id, tenant_id, assessment_id, user_id, status, responses_json, score, max_score, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          assessment_id = excluded.assessment_id,
          user_id = excluded.user_id,
          status = excluded.status,
          responses_json = excluded.responses_json,
          score = excluded.score,
          max_score = excluded.max_score,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        attempt.id,
        attempt.tenantId,
        attempt.assessmentId,
        attempt.userId,
        attempt.status,
        JSON.stringify(attempt.responses),
        attempt.score ?? null,
        attempt.maxScore ?? null,
        attempt.createdAt,
        attempt.updatedAt,
      );
      return attempt;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, assessment_id as assessmentId, user_id as userId, status, responses_json as responsesJson, score, max_score as maxScore, created_at as createdAt, updated_at as updatedAt
        FROM attempts
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId);
      if (!row) {
        return undefined;
      }
      const attempt: Attempt = {
        id: row.id,
        tenantId: row.tenantId,
        assessmentId: row.assessmentId,
        userId: row.userId,
        status: row.status as Attempt['status'],
        responses: JSON.parse(row.responsesJson) ?? [],
        score: row.score ?? undefined,
        maxScore: row.maxScore ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      return attempt;
    },
    listByAssessment(tenantId, assessmentId) {
      const db = client.getConnection(tenantId);
      const rows = db.prepare(`
        SELECT id, tenant_id as tenantId, assessment_id as assessmentId, user_id as userId, status, responses_json as responsesJson, score, max_score as maxScore, created_at as createdAt, updated_at as updatedAt
        FROM attempts
        WHERE assessment_id = ? AND tenant_id = ?
      `).all(assessmentId, tenantId);
      return rows.map(row => {
        const attempt: Attempt = {
          id: row.id,
          tenantId: row.tenantId,
          assessmentId: row.assessmentId,
          userId: row.userId,
          status: row.status as Attempt['status'],
          responses: JSON.parse(row.responsesJson) ?? [],
          score: row.score ?? undefined,
          maxScore: row.maxScore ?? undefined,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
        return attempt;
      });
    },
  };
}
