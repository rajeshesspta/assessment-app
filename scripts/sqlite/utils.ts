import type { SQLiteDatabase } from '../../src/infrastructure/sqlite/client.js';

export function clearTenantTables(db: SQLiteDatabase, tenantId: string): void {
  db.prepare('DELETE FROM attempts WHERE tenant_id = ?').run(tenantId);
  db.prepare('DELETE FROM assessments WHERE tenant_id = ?').run(tenantId);
  db.prepare('DELETE FROM items WHERE tenant_id = ?').run(tenantId);
  db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantId);
}
