import { CosmosClient, Container } from '@azure/cosmos';
import { loadConfig } from '../../config/index.js';

export interface ApiKeyRecord {
  key: string;
  tenantId: string;
  revoked?: boolean;
}

interface ApiKeyEntity extends ApiKeyRecord {
  id: string;
}

interface CacheEntry {
  record: ApiKeyRecord;
  expiresAt: number;
}

interface ApiKeyStore {
  init?(): Promise<void>;
  get(key: string): Promise<ApiKeyRecord | undefined>;
  upsert(record: ApiKeyRecord): Promise<void>;
  revoke(key: string): Promise<void>;
  clearCache(): void;
}

interface CosmosApiKeyStoreOptions {
  client: CosmosClient;
  databaseId: string;
  containerId: string;
  cacheTtlMs: number;
  throughput?: number;
  seed: ApiKeyRecord[];
}

class CosmosApiKeyStore implements ApiKeyStore {
  private cache = new Map<string, CacheEntry>();
  private container?: Container;
  private initPromise?: Promise<void>;

  constructor(private readonly options: CosmosApiKeyStoreOptions) {}

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const { client, databaseId, containerId, throughput, seed } = this.options;
      const { database } = await client.databases.createIfNotExists({ id: databaseId });
      const { container } = await database.containers.createIfNotExists({
        id: containerId,
        // Partition on the API key to keep lookups single-partition; expand to HPK when admin queries require tenant scans.
        partitionKey: { paths: ['/key'], version: 2 },
        throughput,
      });
      this.container = container;

      if (seed.length > 0) {
        await Promise.all(seed.map(record => container.items.upsert({ ...record, id: record.key })));
      }
    })().catch(err => {
      this.initPromise = undefined;
      throw err;
    });

    return this.initPromise;
  }

  private async ensureContainer(): Promise<Container> {
    if (!this.container) {
      await this.init();
    }
    return this.container!;
  }

  private toRecord(entity?: ApiKeyEntity): ApiKeyRecord | undefined {
    if (!entity || entity.revoked) {
      return undefined;
    }
    return { key: entity.key, tenantId: entity.tenantId, revoked: entity.revoked };
  }

  async get(key: string): Promise<ApiKeyRecord | undefined> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.record;
    }

    const container = await this.ensureContainer();
    try {
      const response = await container.item(key, key).read<ApiKeyEntity>();
      const record = this.toRecord(response.resource);
      if (record) {
        this.cache.set(key, { record, expiresAt: Date.now() + this.options.cacheTtlMs });
      } else {
        this.cache.delete(key);
      }
      return record;
    } catch (error: any) {
      if (error?.code === 404) {
        this.cache.delete(key);
        return undefined;
      }
      throw error;
    }
  }

  async upsert(record: ApiKeyRecord): Promise<void> {
    const container = await this.ensureContainer();
    await container.items.upsert({ ...record, id: record.key });
    this.cache.set(record.key, { record, expiresAt: Date.now() + this.options.cacheTtlMs });
  }

  async revoke(key: string): Promise<void> {
    const container = await this.ensureContainer();
    try {
      const { resource } = await container.item(key, key).read<ApiKeyEntity>();
      if (!resource) {
        this.cache.delete(key);
        return;
      }
      await container.items.upsert({ ...resource, revoked: true });
      this.cache.delete(key);
    } catch (error: any) {
      if (error?.code === 404) {
        this.cache.delete(key);
        return;
      }
      throw error;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

class InMemoryApiKeyStore implements ApiKeyStore {
  private records = new Map<string, ApiKeyRecord>();

  constructor(seed: ApiKeyRecord[]) {
    for (const record of seed) {
      this.records.set(record.key, { ...record });
    }
  }

  async get(key: string): Promise<ApiKeyRecord | undefined> {
    const stored = this.records.get(key);
    if (!stored || stored.revoked) {
      return undefined;
    }
    return { ...stored };
  }

  async upsert(record: ApiKeyRecord): Promise<void> {
    this.records.set(record.key, { ...record });
  }

  async revoke(key: string): Promise<void> {
    const existing = this.records.get(key);
    if (existing) {
      this.records.set(key, { ...existing, revoked: true });
    }
  }

  clearCache() {
    // no-op for in-memory store
  }
}

const config = loadConfig();

const apiKeyStoreInstance: ApiKeyStore = config.auth.provider === 'cosmos'
  ? new CosmosApiKeyStore({
      client: new CosmosClient({
        endpoint: config.cosmos.endpoint,
        key: config.cosmos.key,
        userAgentSuffix: 'assessment-app',
      }),
      databaseId: config.cosmos.databaseId,
      containerId: config.cosmos.apiKeysContainer,
      cacheTtlMs: config.auth.cacheTtlMs,
      throughput: config.cosmos.throughput,
      seed: config.auth.seedKeys,
    })
  : new InMemoryApiKeyStore(config.auth.seedKeys);

export const apiKeyStore = apiKeyStoreInstance;

export async function initApiKeyStore() {
  if (apiKeyStoreInstance.init) {
    await apiKeyStoreInstance.init();
  }
}
