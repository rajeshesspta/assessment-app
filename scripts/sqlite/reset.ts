import { loadConfig } from '../../src/config/index.js';
import { createSQLiteTenantClient } from '../../src/infrastructure/sqlite/client.js';
import { seedDefaultTenantData } from '../../src/infrastructure/sqlite/seeds.js';
import { clearTenantTables } from './utils.js';

interface ResetOptions {
  tenantId: string;
}

function parseArgs(argv: string[]): ResetOptions {
  let tenantId: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) {
      tenantId = arg.slice('--tenant='.length);
    }
  }
  const resolvedTenant = tenantId ?? process.env.API_TENANT_ID ?? 'dev-tenant';
  if (!resolvedTenant) {
    throw new Error('Missing tenant identifier. Provide --tenant=<tenantId> or set API_TENANT_ID.');
  }
  return { tenantId: resolvedTenant };
}

async function main() {
  const { tenantId } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = createSQLiteTenantClient(config.persistence.sqlite);
  try {
    const db = client.getConnection(tenantId);
    clearTenantTables(db, tenantId);
    seedDefaultTenantData(db, tenantId);
    console.log(`Reset tenant "${tenantId}" data (cleared & seeded)`);
  } finally {
    client.closeAll();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
