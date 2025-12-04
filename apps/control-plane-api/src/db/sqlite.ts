import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';

const require = createRequire(import.meta.url);
const sqlJsRoot = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
const SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlJsRoot, file) });

type BindingInput = Record<string, unknown> | unknown[] | undefined;

export interface SQLiteStatement {
  run(...parameters: any[]): SQLiteStatement;
  get(...parameters: any[]): any;
  all(...parameters: any[]): any[];
}

export interface SQLiteDatabase {
  prepare(sql: string): SQLiteStatement;
  exec(sql: string): void;
  close(): void;
}

function ensureDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function openDatabase(filePath: string): SqlJsDatabase {
  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    return new SQL.Database(fileBuffer);
  }
  return new SQL.Database();
}

function exportDatabase(db: SqlJsDatabase, filePath: string) {
  const data = db.export();
  const buffer = Buffer.from(data);
  ensureDirectory(filePath);
  fs.writeFileSync(filePath, buffer);
}

function normalizeBinding(parameters: any[]): BindingInput {
  if (parameters.length === 0) {
    return undefined;
  }
  if (parameters.length === 1) {
    const [single] = parameters;
    if (Array.isArray(single)) {
      return single;
    }
    if (single && typeof single === 'object') {
      const normalized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(single)) {
        normalized[`@${key}`] = value;
      }
      return normalized;
    }
  }
  return parameters;
}

function bindAndRun(db: SqlJsDatabase, sql: string, markDirty: () => void): SQLiteStatement {
  const statement: SQLiteStatement = {
    run: (...parameters: any[]) => {
      const stmt = db.prepare(sql);
      const binding = normalizeBinding(parameters);
      if (binding !== undefined) stmt.bind(binding as any);
      stmt.step();
      stmt.free();
      markDirty();
      return statement;
    },
    get: (...parameters: any[]) => {
      const stmt = db.prepare(sql);
      const binding = normalizeBinding(parameters);
      if (binding !== undefined) stmt.bind(binding as any);
      const hasRow = stmt.step();
      const row = hasRow ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    },
    all: (...parameters: any[]) => {
      const stmt = db.prepare(sql);
      const binding = normalizeBinding(parameters);
      if (binding !== undefined) stmt.bind(binding as any);
      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    },
  };
  return statement;
}

export function createSqliteDatabase(filePath: string): SQLiteDatabase {
  ensureDirectory(filePath);
  const db = openDatabase(filePath);
  const markDirty = () => exportDatabase(db, filePath);
  return {
    prepare(sql: string) {
      return bindAndRun(db, sql, markDirty);
    },
    exec(sql: string) {
      db.exec(sql);
      markDirty();
    },
    close() {
      markDirty();
      db.close();
    },
  };
}
