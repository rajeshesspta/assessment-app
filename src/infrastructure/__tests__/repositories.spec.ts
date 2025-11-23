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
    cacheTtlMs: 60000,
    seedKeys: [{ key: 'seed', tenantId: 'tenant' }],
  },
  persistence: {
    provider: 'memory',
  },
};

describe('createRepositoryBundleFromConfig', () => {
  it('returns in-memory bundle when provider is memory', () => {
    const bundle = createRepositoryBundleFromConfig(baseConfig);
    expect(typeof bundle.item.save).toBe('function');
    expect(typeof bundle.assessment.get).toBe('function');
    expect(typeof bundle.attempt.listByAssessment).toBe('function');
  });

  it('throws for cosmos provider until implemented', () => {
    const cosmosConfig: AppConfig = {
      ...baseConfig,
      persistence: { provider: 'cosmos' },
    };
    expect(() => createRepositoryBundleFromConfig(cosmosConfig)).toThrow('Cosmos repository bundle not implemented yet');
  });
});
