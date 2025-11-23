import type { SQLiteDatabase } from './client.js';

function countRows(db: SQLiteDatabase, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
  return (row?.count as number) ?? 0;
}

export function seedDefaultTenantData(db: SQLiteDatabase, tenantId: string): void {
  if (countRows(db, 'items') > 0) {
    return;
  }
  const now = new Date().toISOString();
  const itemId = 'sample-item-1';
  const assessmentId = 'sample-assessment-1';

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO items (id, tenant_id, kind, prompt, choices_json, correct_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itemId,
      tenantId,
      'MCQ',
      '2 + 2?',
      JSON.stringify([{ text: '3' }, { text: '4' }]),
      1,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO assessments (id, tenant_id, title, item_ids_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assessmentId,
      tenantId,
      'Sample Assessment',
      JSON.stringify([itemId]),
      now,
      now,
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
