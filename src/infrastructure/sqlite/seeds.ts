import type { SQLiteDatabase } from './client.js';
import type { Assessment, Attempt, Item } from '../../common/types.js';

export function insertItem(db: SQLiteDatabase, item: Item): Item {
  db.prepare(`
    INSERT INTO items (id, tenant_id, kind, prompt, choices_json, correct_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
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
}

export function insertAssessment(db: SQLiteDatabase, assessment: Assessment): Assessment {
  db.prepare(`
    INSERT INTO assessments (id, tenant_id, title, item_ids_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
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
}

export function insertAttempt(db: SQLiteDatabase, attempt: Attempt): Attempt {
  db.prepare(`
    INSERT INTO attempts (id, tenant_id, assessment_id, user_id, status, responses_json, score, max_score, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
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
}

export function getItemById(db: SQLiteDatabase, tenantId: string, itemId: string): Item | undefined {
  const row = db.prepare(`
    SELECT id, tenant_id as tenantId, kind, prompt, choices_json as choicesJson, correct_index as correctIndex, created_at as createdAt, updated_at as updatedAt
    FROM items
    WHERE tenant_id = ? AND id = ?
  `).get(tenantId, itemId);
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    prompt: row.prompt,
    choices: JSON.parse(row.choicesJson) as Item['choices'],
    correctIndex: row.correctIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Item;
}

function tenantSampleItems(seedTenantId: string) {
  return [
    {
      id: 'sample-item-1',
      prompt: 'Capital of France?',
      choices: [{ text: 'Paris' }, { text: 'Berlin' }, { text: 'Madrid' }, { text: 'Rome' }],
      correctIndex: 0,
    },
    {
      id: 'sample-item-2',
      prompt: '2 + 2 = ?',
      choices: [{ text: '3' }, { text: '4' }, { text: '5' }],
      correctIndex: 1,
    },
    {
      id: 'sample-item-3',
      prompt: 'Pick the odd number',
      choices: [{ text: '6' }, { text: '8' }, { text: '9' }, { text: '10' }],
      correctIndex: 2,
    },
  ].map(item => ({ ...item, tenantId: seedTenantId }));
}

export function seedDefaultTenantData(db: SQLiteDatabase, tenantId: string): void {
  const sampleItems = tenantSampleItems(tenantId);
  const existing = getItemById(db, tenantId, sampleItems[0].id);
  if (existing) {
    console.log('Seed data already exists for tenant:', tenantId);
    return;
  }
  const now = new Date().toISOString();
  for (const item of sampleItems) {
    insertItem(db, {
      id: item.id,
      tenantId,
      kind: 'MCQ',
      prompt: item.prompt,
      choices: item.choices,
      correctIndex: item.correctIndex,
      createdAt: now,
      updatedAt: now,
    });
  }
  insertAssessment(db, {
    id: 'sample-assessment-1',
    tenantId,
    title: 'Sample Assessment',
    itemIds: sampleItems.map(item => item.id),
    createdAt: now,
    updatedAt: now,
  });
}
