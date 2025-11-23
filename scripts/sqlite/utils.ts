import type { SQLiteDatabase } from '../../src/infrastructure/sqlite/client.js';

function safeRollback(db: SQLiteDatabase) {
  try {
    db.exec('ROLLBACK');
  } catch {
    // rollback can fail when no transaction is active; ignore in that case
  }
}

export function clearTenantTables(db: SQLiteDatabase, tenantId: string): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM attempts WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM assessments WHERE tenant_id = ?').run(tenantId);
    db.prepare('DELETE FROM items WHERE tenant_id = ?').run(tenantId);
    db.exec('COMMIT');
  } catch (error) {
    safeRollback(db);
    throw error;
  }
}
