import type { SQLiteDatabase } from './client.js';
import type { Assessment, Item } from '../../common/types.js';

function safeRollback(db: SQLiteDatabase) {
  try {
    db.exec('ROLLBACK');
  } catch {
    // rollback can fail when no transaction is active; ignore in that case
  }
}

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

export function seedDefaultTenantData(db: SQLiteDatabase, tenantId: string): void {
  const existing = getItemById(db, tenantId, 'sample-item-2');
  if (existing) {
    console.log('Seed data already exists for tenant:', tenantId);
    return;
  }
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    insertItem(db, {
      id: 'sample-item-2',
      tenantId,
      kind: 'MCQ',
      prompt: '2 + 2?',
      choices: [{ text: '3' }, { text: '4' }],
      correctIndex: 1,
      createdAt: now,
      updatedAt: now,
    });
    insertAssessment(db, {
      id: 'sample-assessment-1',
      tenantId,
      title: 'Sample Assessment',
      itemIds: ['sample-item-2'],
      createdAt: now,
      updatedAt: now,
    });
    db.exec('COMMIT');
  } catch (error) {
    safeRollback(db);
    throw error;
  }
}
