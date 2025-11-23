import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { SqliteConfig } from '../../config/index.js';
import { runMigrations } from './migrator.js';

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

export interface SQLiteTenantClient {
  getConnection(tenantId: string): SQLiteDatabase;
  closeAll(): void;
}

interface SqlJsConnection {
  db: SqlJsDatabase;
  filePath: string;
  adapter: SQLiteDatabase;
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

function exportDatabase(connection: SqlJsConnection) {
  const data = connection.db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(connection.filePath), { recursive: true });
  fs.writeFileSync(connection.filePath, buffer);
}

function createAdapter(connection: SqlJsConnection): SQLiteDatabase {
  const markDirty = () => exportDatabase(connection);
  return {
    prepare(sql: string) {
      return bindAndRun(connection.db, sql, markDirty);
    },
    exec(sql: string) {
      connection.db.exec(sql);
      markDirty();
    },
    close() {
      markDirty();
      connection.db.close();
    },
  };
}

export function resolveTenantDbPath(config: SqliteConfig, tenantId: string): string {
  const fileName = config.filePattern.replace('{tenantId}', tenantId);
  const candidate = path.isAbsolute(fileName) ? fileName : path.join(config.dbRoot, fileName);
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  return candidate;
}

function openSqlJsDatabase(filePath: string): SqlJsDatabase {
  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    return new SQL.Database(fileBuffer);
  }
  return new SQL.Database();
}

export function createSQLiteTenantClient(config: SqliteConfig): SQLiteTenantClient {
  const connections = new Map<string, SqlJsConnection>();
  fs.mkdirSync(config.dbRoot, { recursive: true });

  function getConnection(tenantId: string): SQLiteDatabase {
    let connection = connections.get(tenantId);
    if (!connection) {
      const filePath = resolveTenantDbPath(config, tenantId);
      const db = openSqlJsDatabase(filePath);
      connection = {
        db,
        filePath,
        adapter: undefined as unknown as SQLiteDatabase,
      };
      connection.adapter = createAdapter(connection);
      connections.set(tenantId, connection);
      runMigrations(connection.adapter, config.migrationsDir);
      exportDatabase(connection);
    }
    return connection.adapter;
  }

  function closeAll() {
    for (const connection of connections.values()) {
      try {
        connection.adapter.close();
      } catch (error) {
        // intentionally swallow close errors to avoid shutdown issues
      }
    }
    connections.clear();
  }

  return { getConnection, closeAll };
}
