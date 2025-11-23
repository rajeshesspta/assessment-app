import { loadConfig } from '../../src/config/index.js';
import { provisionTenantDatabase } from '../../src/infrastructure/sqlite/provisioner.js';

function parseArgs(argv: string[]): string {
  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) {
      return arg.slice('--tenant='.length);
    }
  }
  throw new Error('Missing required --tenant=<tenantId> argument');
}

async function main() {
  const tenantId = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  provisionTenantDatabase({ config: config.persistence.sqlite, tenantId, seed: true });
  console.log(`Seeded SQLite tenant data for "${tenantId}"`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
