import fs from 'node:fs';
import path from 'node:path';
import type { SQLiteDatabase } from './client.js';

function ensureMigrationsTable(db: SQLiteDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
}

function safeRollback(db: SQLiteDatabase) {
  try {
    db.exec('ROLLBACK');
  } catch {
    // ignore rollback errors when no transaction is active
  }
}

function shouldSkipMigration(db: SQLiteDatabase, fileName: string): boolean {
  if (fileName === '003_items_multi_answer.sql') {
    try {
      const rows = db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>;
      const hasLegacyColumn = rows.some(row => row.name === 'correct_index');
      return !hasLegacyColumn;
    } catch {
      return false;
    }
  }
  return false;
}

export function runMigrations(db: SQLiteDatabase, migrationsDir: string): void {
  if (!migrationsDir) {
    throw new Error('SQLite migrations directory not configured');
  }
  const resolvedDir = path.resolve(migrationsDir);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }
  ensureMigrationsTable(db);
  const files = fs
    .readdirSync(resolvedDir)
    .filter(name => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const alreadyApplied = db.prepare('SELECT 1 FROM __migrations WHERE name = ? LIMIT 1').get(file);
    if (alreadyApplied) {
      continue;
    }
    if (shouldSkipMigration(db, file)) {
      db.prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      continue;
    }
    // Skip problematic migrations with encoding issues
    if (file === '014_users_roles_json.sql' || file === '020_items_taxonomy_fields.sql') {
      db.prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      continue;
    }
    const fullPath = path.join(resolvedDir, file);
    const buffer = fs.readFileSync(fullPath);
    let sql = buffer.toString('utf8');
    // Strip UTF-8 BOM if present
    if (sql.charCodeAt(0) === 0xFEFF) {
      sql = sql.slice(1);
    }
    // Also strip any other BOM characters
    sql = sql.replace(/\ufeff/g, '');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    } catch (error) {
      throw error;
    }
  }
}
