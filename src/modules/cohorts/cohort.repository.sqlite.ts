import type { Cohort } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';
import type { CohortRepository } from './cohort.repository.js';

function rowToCohort(row: any): Cohort {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description ?? undefined,
    learnerIds: JSON.parse(row.learnerIdsJson) as Cohort['learnerIds'],
    assessmentIds: JSON.parse(row.assessmentIdsJson) as Cohort['assessmentIds'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSQLiteCohortRepository(client: SQLiteTenantClient): CohortRepository {
  return {
    save(cohort) {
      const db = client.getConnection(cohort.tenantId);
      db.prepare(`
        INSERT INTO cohorts (id, tenant_id, name, description, learner_ids_json, assessment_ids_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          learner_ids_json = excluded.learner_ids_json,
          assessment_ids_json = excluded.assessment_ids_json,
          updated_at = excluded.updated_at
      `).run(
        cohort.id,
        cohort.tenantId,
        cohort.name,
        cohort.description ?? null,
        JSON.stringify(cohort.learnerIds),
        JSON.stringify(cohort.assessmentIds),
        cohort.createdAt,
        cohort.updatedAt,
      );
      return cohort;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, name, description, learner_ids_json as learnerIdsJson,
               assessment_ids_json as assessmentIdsJson, created_at as createdAt, updated_at as updatedAt
        FROM cohorts
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId);
      if (!row) {
        return undefined;
      }
      return rowToCohort(row);
    },
    list(tenantId) {
      const db = client.getConnection(tenantId);
      const rows = db.prepare(`
        SELECT id, tenant_id as tenantId, name, description, learner_ids_json as learnerIdsJson,
               assessment_ids_json as assessmentIdsJson, created_at as createdAt, updated_at as updatedAt
        FROM cohorts
        WHERE tenant_id = ?
        ORDER BY name ASC
      `).all(tenantId);
      return rows.map(rowToCohort);
    },
    listByLearner(tenantId, learnerId) {
      const db = client.getConnection(tenantId);
      const rows = db.prepare(`
        SELECT id, tenant_id as tenantId, name, description, learner_ids_json as learnerIdsJson,
               assessment_ids_json as assessmentIdsJson, created_at as createdAt, updated_at as updatedAt
        FROM cohorts
        WHERE tenant_id = ?
      `).all(tenantId);
      return rows.map(rowToCohort).filter(cohort => cohort.learnerIds.includes(learnerId));
    },
  };
}
