import type { Tenant } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';
import type { TenantRepository } from './tenant.repository.js';

const DIRECTORY_ID = '__tenant_directory__';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  contact_email: string | null;
  api_key: string;
  rate_limit_json: string;
  persistence_provider: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as Tenant['status'],
    contactEmail: row.contact_email ?? undefined,
    apiKey: row.api_key,
    rateLimit: JSON.parse(row.rate_limit_json) as Tenant['rateLimit'],
    persistence: { provider: row.persistence_provider as Tenant['persistence']['provider'] },
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Tenant['metadata']) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSQLiteTenantRepository(client: SQLiteTenantClient, directoryId = DIRECTORY_ID): TenantRepository {
  const getDb = () => client.getConnection(directoryId);

  function ensureSlugAvailable(slug: string, id: string) {
    const db = getDb();
    const conflict = db.prepare('SELECT id FROM tenants WHERE slug = ? AND id <> ?').get(slug, id) as { id: string } | undefined;
    if (conflict) {
      throw new Error(`Tenant slug "${slug}" already in use`);
    }
  }

  return {
    list() {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, name, slug, status, contact_email, api_key, rate_limit_json, persistence_provider, metadata_json, created_at, updated_at
           FROM tenants
           ORDER BY created_at`
        )
        .all() as TenantRow[];
      return rows.map(mapRow);
    },
    getById(id) {
      const db = getDb();
      const row = db
        .prepare(
          `SELECT id, name, slug, status, contact_email, api_key, rate_limit_json, persistence_provider, metadata_json, created_at, updated_at
           FROM tenants
           WHERE id = ?`
        )
        .get(id) as TenantRow | undefined;
      return row ? mapRow(row) : undefined;
    },
    getBySlug(slug) {
      const db = getDb();
      const row = db
        .prepare(
          `SELECT id, name, slug, status, contact_email, api_key, rate_limit_json, persistence_provider, metadata_json, created_at, updated_at
           FROM tenants
           WHERE slug = ?`
        )
        .get(slug) as TenantRow | undefined;
      return row ? mapRow(row) : undefined;
    },
    save(tenant) {
      ensureSlugAvailable(tenant.slug, tenant.id);
      const db = getDb();
      db.prepare(
        `INSERT INTO tenants (id, name, slug, status, contact_email, api_key, rate_limit_json, persistence_provider, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           slug = excluded.slug,
           status = excluded.status,
           contact_email = excluded.contact_email,
           api_key = excluded.api_key,
           rate_limit_json = excluded.rate_limit_json,
           persistence_provider = excluded.persistence_provider,
           metadata_json = excluded.metadata_json,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`
      ).run(
        tenant.id,
        tenant.name,
        tenant.slug,
        tenant.status,
        tenant.contactEmail ?? null,
        tenant.apiKey,
        JSON.stringify(tenant.rateLimit),
        tenant.persistence.provider,
        tenant.metadata ? JSON.stringify(tenant.metadata) : null,
        tenant.createdAt,
        tenant.updatedAt
      );
      return tenant;
    },
    delete(id) {
      const db = getDb();
      db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    },
    dispose() {
      client.closeAll();
    },
  };
}
