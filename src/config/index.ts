import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CosmosConfig {
  endpoint: string;
  key: string;
  databaseId: string;
  apiKeysContainer: string;
  throughput?: number;
}

export type AuthProvider = 'memory' | 'cosmos';

export interface AuthConfig {
  provider: AuthProvider;
  cacheTtlMs: number;
  seedKeys: Array<{ key: string; tenantId: string }>;
  superAdminTenantId: string;
}

export interface AppConfig {
  cosmos: CosmosConfig;
  auth: AuthConfig;
  persistence: PersistenceConfig;
}

export type PersistenceProvider = 'memory' | 'cosmos' | 'sqlite';

export interface PersistenceConfig {
  provider: PersistenceProvider;
  sqlite: SqliteConfig;
}

export interface SqliteConfig {
  dbRoot: string;
  filePattern: string;
  migrationsDir: string;
  seedDefaultTenant: boolean;
}

function readIntFromEnv(envName: string): number | undefined {
  const raw = process.env[envName];
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readProviderFromEnv(envName: string): PersistenceProvider {
  const raw = (process.env[envName] ?? 'sqlite').toLowerCase();
  if (raw === 'cosmos') return 'cosmos';
  if (raw === 'memory') return 'memory';
  return 'sqlite';
}

function readAuthProviderFromEnv(envName: string): AuthProvider {
  const raw = (process.env[envName] ?? 'memory').toLowerCase();
  return raw === 'cosmos' ? 'cosmos' : 'memory';
}

function readBooleanFromEnv(envName: string, defaultValue: boolean): boolean {
  const raw = process.env[envName];
  if (raw === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function loadConfig(): AppConfig {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const endpoint = process.env.COSMOS_ENDPOINT || 'https://localhost:8081';
  const key = process.env.COSMOS_KEY || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDjEwef4zE3DUdh2PQ==';
  const databaseId = process.env.COSMOS_DATABASE_ID || 'assessment-app';
  const apiKeysContainer = process.env.COSMOS_API_KEYS_CONTAINER || 'api-keys';
  const throughput = readIntFromEnv('COSMOS_THROUGHPUT');
  const cacheTtlMs = readIntFromEnv('API_KEY_CACHE_TTL_MS') ?? 60_000;
  const provider = readProviderFromEnv('DB_PROVIDER');
  const dbRoot = process.env.SQLITE_DB_ROOT || path.resolve(projectRoot, 'data', 'sqlite');
  const filePattern = process.env.SQLITE_DB_FILE_PATTERN || '{tenantId}.db';
  const migrationsDir = process.env.SQLITE_MIGRATIONS_DIR || path.resolve(projectRoot, 'migrations', 'sqlite');
  const seedDefaultTenant = readBooleanFromEnv('SQLITE_SEED_DEFAULT_TENANT', true);
  const authProvider = readAuthProviderFromEnv('AUTH_PROVIDER');

  const envSeedKey = process.env.API_KEY;
  const envSeedTenant = process.env.API_TENANT_ID;
  const superAdminTenantId = process.env.SUPER_ADMIN_TENANT_ID || 'sys-tenant';
  const superAdminApiKey = process.env.SUPER_ADMIN_API_KEY || 'sys-admin-key';
  const seedKeys: Array<{ key: string; tenantId: string }> = [
    { key: superAdminApiKey, tenantId: superAdminTenantId },
  ];
  if (envSeedKey && envSeedTenant) {
    seedKeys.push({ key: envSeedKey, tenantId: envSeedTenant });
  } else {
    seedKeys.push({ key: 'dev-key', tenantId: 'dev-tenant' });
  }

  return {
    cosmos: { endpoint, key, databaseId, apiKeysContainer, throughput },
    auth: { provider: authProvider, cacheTtlMs, seedKeys, superAdminTenantId },
    persistence: {
      provider,
      sqlite: {
        dbRoot,
        filePattern,
        migrationsDir,
        seedDefaultTenant,
      },
    },
  };
}
