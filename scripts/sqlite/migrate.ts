import { loadConfig } from '../../src/config/index.js';
import { createSQLiteTenantClient, resolveTenantDbPath } from '../../src/infrastructure/sqlite/client.js';
import { TENANT_DIRECTORY_ID } from '../../src/modules/tenants/tenant.repository.sqlite.js';

interface MigrateOptions {
  tenantIds: string[];
  includeDirectory: boolean;
}

function parseArgs(argv: string[]): MigrateOptions {
  const tenantIds = new Set<string>();
  let includeDirectory = true;

  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) {
      tenantIds.add(arg.slice('--tenant='.length));
    } else if (arg === '--all-tenants') {
      tenantIds.add('__ALL__');
    } else if (arg === '--no-directory') {
      includeDirectory = false;
    }
  }

  return { tenantIds: Array.from(tenantIds), includeDirectory };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const client = createSQLiteTenantClient(config.persistence.sqlite);

  try {
    const tenants = new Set<string>();
    const hasAllMarker = options.tenantIds.includes('__ALL__');

    let directoryDb = options.includeDirectory !== false ? client.getConnection(TENANT_DIRECTORY_ID) : undefined;
    if (directoryDb) {
      tenants.add(TENANT_DIRECTORY_ID);
    }

    if (hasAllMarker) {
      if (!directoryDb) {
        directoryDb = client.getConnection(TENANT_DIRECTORY_ID);
      }
      const rows = directoryDb
        .prepare('SELECT id FROM tenants ORDER BY created_at')
        .all() as Array<{ id: string }>;
      for (const row of rows) {
        tenants.add(row.id);
      }
    }

    for (const tenantId of options.tenantIds) {
      if (tenantId !== '__ALL__') {
        tenants.add(tenantId);
      }
    }

    if (!hasAllMarker && options.tenantIds.length === 0) {
      tenants.add(process.env.API_TENANT_ID ?? 'dev-tenant');
    }

    if (tenants.size === 0) {
      throw new Error('No tenants selected for migration');
    }

    for (const tenantId of tenants) {
      client.getConnection(tenantId);
      const targetPath = resolveTenantDbPath(config.persistence.sqlite, tenantId);
      console.log(`Applied migrations for "${tenantId}" at ${targetPath}`);
    }
  } finally {
    client.closeAll();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
