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
  });

  it('returns defaults when env vars absent', () => {
    const config = loadConfig();

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
      persistence: { provider: 'memory' },
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
    expect(config.persistence).toEqual({ provider: 'cosmos' });
  });

  it('ignores invalid numeric env values', () => {
    process.env.COSMOS_THROUGHPUT = 'not-a-number';
    process.env.API_KEY_CACHE_TTL_MS = 'NaN';
    process.env.DB_PROVIDER = 'unknown';

    const config = loadConfig();

    expect(config.cosmos.throughput).toBeUndefined();
    expect(config.auth.cacheTtlMs).toBe(60000);
    expect(config.persistence.provider).toBe('memory');
  });
});
