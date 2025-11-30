import { createSQLiteTenantClient } from '../../src/infrastructure/sqlite/client.js';
import { seedSuperAdmin } from '../../src/infrastructure/sqlite/seeds.js';
import { loadConfig } from '../../src/config/index.js';
import { TENANT_DIRECTORY_ID } from '../../src/modules/tenants/tenant.repository.sqlite.js';

async function bootstrap() {
  const config = loadConfig();
  const sysTenantId = config.auth.superAdminTenantId;

  console.log(`🚀 Bootstrapping System Tenant: ${sysTenantId}`);

  const client = createSQLiteTenantClient(config.persistence.sqlite);

  try {
    // 1. Initialize Directory DB and ensure sys-tenant exists in the registry
    console.log('... Registering sys-tenant in directory');
    const directoryDb = client.getConnection(TENANT_DIRECTORY_ID);
    
    const now = new Date().toISOString();
    directoryDb.prepare(`
      INSERT INTO tenants (id, name, slug, status, api_key, rate_limit_json, persistence_provider, contact_email, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(
      sysTenantId,
      'Better Shift System',
      'better-shift-system',
      'active',
      process.env.SUPER_ADMIN_API_KEY || 'sys-admin-key',
      JSON.stringify({ requestsPerMinute: 1000 }),
      'sqlite',
      'admin@bettershift.com',
      null,
      now,
      now
    );

    // 2. Initialize System Tenant DB & Seed Super Admin
    console.log('... Provisioning sys-tenant database & seeding Super Admin');
    const sysDb = client.getConnection(sysTenantId);
    
    seedSuperAdmin(sysDb, sysTenantId, 'admin@bettershift.com');

    console.log('✅ System Bootstrap Complete.');
  } finally {
    client.closeAll();
  }
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
