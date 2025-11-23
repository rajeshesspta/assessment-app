import { loadConfig } from '../../src/config/index.js';
import { provisionTenantDatabase } from '../../src/infrastructure/sqlite/provisioner.js';

function parseArgs(argv: string[]): { tenantId: string; seed: boolean } {
  let tenantId: string | undefined;
  let seed: boolean | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) {
      tenantId = arg.slice('--tenant='.length);
    }
    if (arg.startsWith('--seed=')) {
      const value = arg.slice('--seed='.length).toLowerCase();
      seed = ['1', 'true', 'yes', 'on'].includes(value);
    }
  }

  if (!tenantId) {
    throw new Error('Missing required --tenant=<tenantId> argument');
  }

  return { tenantId, seed: seed ?? true };
}

async function main() {
  const { tenantId, seed } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const shouldSeed = seed && config.persistence.sqlite.seedDefaultTenant;
  provisionTenantDatabase({ config: config.persistence.sqlite, tenantId, seed: shouldSeed });
  console.log(`Provisioned SQLite database for tenant "${tenantId}" at ${config.persistence.sqlite.dbRoot}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
