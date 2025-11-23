import fs from 'node:fs';
import path from 'node:path';
import type { SQLiteDatabase } from './client.js';

function ensureMigrationsTable(db: SQLiteDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
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
    const fullPath = path.join(resolvedDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
