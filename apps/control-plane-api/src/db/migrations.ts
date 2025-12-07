import type { SQLiteDatabase } from './sqlite';

export function runMigrations(db: SQLiteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hosts_json TEXT NOT NULL,
      support_email TEXT NOT NULL,
      premium_deployment INTEGER NOT NULL DEFAULT 0,
      headless_config_json TEXT NOT NULL,
      auth_config_json TEXT NOT NULL,
      client_app_json TEXT NOT NULL,
      branding_json TEXT NOT NULL,
      feature_flags_json TEXT NOT NULL,
      engine_size_id TEXT,
      engine_size_json TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS engine_sizes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    db.exec(`
      ALTER TABLE engine_sizes
      ADD COLUMN metadata_json TEXT
    `);
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('duplicate column name')) {
      // Column already exists; ignore.
    } else {
      throw error;
    }
  }

  try {
    db.exec(`
      ALTER TABLE tenant_registry
      ADD COLUMN engine_size_json TEXT
    `);
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('duplicate column name')) {
      // Column already exists; ignore.
    } else {
      throw error;
    }
  }

  try {
    db.exec(`
      ALTER TABLE tenant_registry
      ADD COLUMN engine_size_id TEXT
    `);
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('duplicate column name')) {
      // Column already exists; ignore.
    } else {
      throw error;
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenant_registry(id)
    );
  `);
}
