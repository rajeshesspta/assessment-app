import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../index.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COSMOS_ENDPOINT;
    delete process.env.COSMOS_KEY;
    delete process.env.COSMOS_DATABASE_ID;
    delete process.env.COSMOS_API_KEYS_CONTAINER;
    delete process.env.COSMOS_THROUGHPUT;
    delete process.env.API_KEY_CACHE_TTL_MS;
    delete process.env.API_KEY;
    delete process.env.API_TENANT_ID;
    delete process.env.DB_PROVIDER;
    delete process.env.SQLITE_DB_ROOT;
    delete process.env.SQLITE_DB_FILE_PATTERN;
    delete process.env.SQLITE_MIGRATIONS_DIR;
    delete process.env.SQLITE_SEED_DEFAULT_TENANT;
  });

  it('returns defaults when env vars absent', () => {
    const config = loadConfig();

    const defaultRoot = path.resolve(process.cwd(), 'data', 'sqlite');
    const defaultMigrations = path.resolve(process.cwd(), 'migrations', 'sqlite');

    expect(config).toEqual({
      cosmos: {
        endpoint: 'https://localhost:8081',
        key: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDjEwef4zE3DUdh2PQ==',
        databaseId: 'assessment-app',
        apiKeysContainer: 'api-keys',
        throughput: undefined,
      },
      auth: {
        cacheTtlMs: 60000,
        seedKeys: [{ key: 'dev-key', tenantId: 'dev-tenant' }],
      },
      persistence: {
        provider: 'sqlite',
        sqlite: {
          dbRoot: defaultRoot,
          filePattern: '{tenantId}.db',
          migrationsDir: defaultMigrations,
          seedDefaultTenant: true,
        },
      },
    });
  });

  it('honors provided env vars and parses numbers safely', () => {
    process.env.COSMOS_ENDPOINT = 'https://example.documents.azure.com';
    process.env.COSMOS_KEY = 'super-secret';
    process.env.COSMOS_DATABASE_ID = 'custom-db';
    process.env.COSMOS_API_KEYS_CONTAINER = 'keys';
    process.env.COSMOS_THROUGHPUT = '500';
    process.env.API_KEY_CACHE_TTL_MS = '120000';
    process.env.API_KEY = 'seed-key';
    process.env.API_TENANT_ID = 'tenant-123';
    process.env.DB_PROVIDER = 'cosmos';
    process.env.SQLITE_DB_ROOT = 'C:/db/root';
    process.env.SQLITE_DB_FILE_PATTERN = 'db-{tenantId}.sqlite';
    process.env.SQLITE_MIGRATIONS_DIR = 'C:/db/migrations';
    process.env.SQLITE_SEED_DEFAULT_TENANT = 'false';

    const config = loadConfig();

    expect(config.cosmos).toEqual({
      endpoint: 'https://example.documents.azure.com',
      key: 'super-secret',
      databaseId: 'custom-db',
      apiKeysContainer: 'keys',
      throughput: 500,
    });
    expect(config.auth).toEqual({
      cacheTtlMs: 120000,
      seedKeys: [{ key: 'seed-key', tenantId: 'tenant-123' }],
    });
    expect(config.persistence).toEqual({
      provider: 'cosmos',
      sqlite: {
        dbRoot: 'C:/db/root',
        filePattern: 'db-{tenantId}.sqlite',
        migrationsDir: 'C:/db/migrations',
        seedDefaultTenant: false,
      },
    });
  });

  it('ignores invalid numeric env values', () => {
    process.env.COSMOS_THROUGHPUT = 'not-a-number';
    process.env.API_KEY_CACHE_TTL_MS = 'NaN';
    process.env.DB_PROVIDER = 'unknown';
    process.env.SQLITE_SEED_DEFAULT_TENANT = 'off';

    const config = loadConfig();

    expect(config.cosmos.throughput).toBeUndefined();
    expect(config.auth.cacheTtlMs).toBe(60000);
    expect(config.persistence.provider).toBe('sqlite');
    expect(config.persistence.sqlite.seedDefaultTenant).toBe(false);
  });
});
