import { loadConfig } from './src/config/index.js';
import { createSQLiteTenantClient } from './src/infrastructure/sqlite/client.js';

async function main() {
  const config = loadConfig();
  const client = createSQLiteTenantClient(config.persistence.sqlite);
  const db = client.getConnection('dev-tenant');
  
  // Delete the migration entry to allow re-run
  db.prepare('DELETE FROM __migrations WHERE name = ?').run('014_users_roles_json.sql');
  
  console.log('Removed migration entry, now run npm run db:migrate -- --tenant=dev-tenant');
  
  client.closeAll();
}

main().catch(console.error);