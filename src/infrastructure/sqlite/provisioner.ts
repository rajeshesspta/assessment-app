import { createSQLiteTenantClient } from './client.js';
import { seedDefaultTenantData } from './seeds.js';
import type { SqliteConfig } from '../../config/index.js';

export interface ProvisionOptions {
  config: SqliteConfig;
  tenantId: string;
  seed?: boolean;
}

export function provisionTenantDatabase(options: ProvisionOptions): void {
  const { config, tenantId, seed = false } = options;
  const client = createSQLiteTenantClient(config);
  const db = client.getConnection(tenantId);
  try {
    if (seed) {
      seedDefaultTenantData(db, tenantId);
    }
  } finally {
    client.closeAll();
  }
}
