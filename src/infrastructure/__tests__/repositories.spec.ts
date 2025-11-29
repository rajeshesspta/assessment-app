import { describe, expect, it } from 'vitest';
import { createRepositoryBundleFromConfig } from '../repositories.js';
import type { AppConfig } from '../../config/index.js';

const baseConfig: AppConfig = {
  cosmos: {
    endpoint: 'https://localhost:8081',
    key: 'key',
    databaseId: 'assessment-app',
    apiKeysContainer: 'api-keys',
    throughput: undefined,
  },
  auth: {
    provider: 'memory',
    cacheTtlMs: 60000,
    seedKeys: [{ key: 'seed', tenantId: 'tenant' }],
    superAdminTenantId: 'sys-tenant',
  },
  persistence: {
    provider: 'memory',
    sqlite: {
      dbRoot: './tmp/sqlite',
      filePattern: '{tenantId}.db',
      migrationsDir: './migrations/sqlite',
      seedDefaultTenant: true,
    },
  },
};

describe('createRepositoryBundleFromConfig', () => {
  it('returns in-memory bundle when provider is memory', () => {
    const bundle = createRepositoryBundleFromConfig(baseConfig);
    expect(typeof bundle.item.save).toBe('function');
    expect(typeof bundle.assessment.getById).toBe('function');
    expect(typeof bundle.attempt.listByAssessment).toBe('function');
    expect(typeof bundle.user.getById).toBe('function');
  });

  it('returns sqlite bundle when provider is sqlite', () => {
    const sqliteConfig: AppConfig = {
      ...baseConfig,
      persistence: {
        ...baseConfig.persistence,
        provider: 'sqlite',
      },
    };
    const bundle = createRepositoryBundleFromConfig(sqliteConfig);
    expect(typeof bundle.item.save).toBe('function');
    expect(typeof bundle.assessment.getById).toBe('function');
    expect(typeof bundle.attempt.listByAssessment).toBe('function');
    expect(typeof bundle.user.getById).toBe('function');
    expect(typeof bundle.dispose).toBe('function');
    bundle.dispose?.();
  });

  it('throws for cosmos provider until implemented', () => {
    const cosmosConfig: AppConfig = {
      ...baseConfig,
      persistence: {
        ...baseConfig.persistence,
        provider: 'cosmos',
      },
    };
    expect(() => createRepositoryBundleFromConfig(cosmosConfig)).toThrow('Cosmos repository bundle not implemented yet');
  });
});
