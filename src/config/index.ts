export interface CosmosConfig {
  endpoint: string;
  key: string;
  databaseId: string;
  apiKeysContainer: string;
  throughput?: number;
}

export interface AuthConfig {
  cacheTtlMs: number;
  seedKeys: Array<{ key: string; tenantId: string }>;
}

export interface AppConfig {
  cosmos: CosmosConfig;
  auth: AuthConfig;
}

function readIntFromEnv(envName: string): number | undefined {
  const raw = process.env[envName];
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function loadConfig(): AppConfig {
  const endpoint = process.env.COSMOS_ENDPOINT || 'https://localhost:8081';
  const key = process.env.COSMOS_KEY || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDjEwef4zE3DUdh2PQ==';
  const databaseId = process.env.COSMOS_DATABASE_ID || 'assessment-app';
  const apiKeysContainer = process.env.COSMOS_API_KEYS_CONTAINER || 'api-keys';
  const throughput = readIntFromEnv('COSMOS_THROUGHPUT');
  const cacheTtlMs = readIntFromEnv('API_KEY_CACHE_TTL_MS') ?? 60_000;

  const envSeedKey = process.env.API_KEY;
  const envSeedTenant = process.env.API_TENANT_ID;
  const seedKeys = envSeedKey && envSeedTenant
    ? [{ key: envSeedKey, tenantId: envSeedTenant }]
    : [{ key: 'dev-key', tenantId: 'dev-tenant' }];

  return {
    cosmos: { endpoint, key, databaseId, apiKeysContainer, throughput },
    auth: { cacheTtlMs, seedKeys },
  };
}
