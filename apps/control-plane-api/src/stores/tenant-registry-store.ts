import type { Container } from '@azure/cosmos';
import { randomUUID } from 'node:crypto';
import type { SQLiteDatabase } from '../db/sqlite';

export interface TenantRow {
  id: string;
  name: string;
  hosts_json: string;
  support_email: string;
  premium_deployment: number;
  headless_config_json: string;
  auth_config_json: string;
  client_app_json: string;
  branding_json: string;
  feature_flags_json: string;
  engine_size_id: string | null;
  engine_size_json: string | null;
  status: string;
  updated_at: string;
  updated_by: string;
}

export interface TenantRowWriteInput extends Omit<TenantRow, 'premium_deployment'> {
  premium_deployment: number;
}

export interface TenantAuditLogEntry {
  tenant_id: string;
  action: string;
  payload_json: string;
  created_at: string;
  actor: string;
}

export interface TenantRegistryStore {
  listTenants(): Promise<TenantRow[]>;
  getTenant(id: string): Promise<TenantRow | undefined>;
  upsertTenant(payload: TenantRowWriteInput): Promise<void>;
  insertAuditLog(entry: TenantAuditLogEntry): Promise<void>;
}

export class SqliteTenantRegistryStore implements TenantRegistryStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async listTenants(): Promise<TenantRow[]> {
    return this.db
      .prepare(`
        SELECT id, name, hosts_json, support_email, premium_deployment, headless_config_json, auth_config_json,
            client_app_json, branding_json, feature_flags_json, engine_size_id, engine_size_json, status, updated_at, updated_by
        FROM tenant_registry
        ORDER BY updated_at DESC
      `)
      .all();
  }

  async getTenant(id: string): Promise<TenantRow | undefined> {
    return this.db
      .prepare(`
          SELECT id, name, hosts_json, support_email, premium_deployment, headless_config_json, auth_config_json,
            client_app_json, branding_json, feature_flags_json, engine_size_id, engine_size_json, status, updated_at, updated_by
        FROM tenant_registry
        WHERE id = ?
      `)
      .get(id);
  }

  async upsertTenant(payload: TenantRowWriteInput): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO tenant_registry (
          id, name, hosts_json, support_email, premium_deployment, headless_config_json, auth_config_json,
          client_app_json, branding_json, feature_flags_json, engine_size_id, engine_size_json, status, updated_at, updated_by
        ) VALUES (
          @id, @name, @hosts_json, @support_email, @premium_deployment, @headless_config_json, @auth_config_json,
          @client_app_json, @branding_json, @feature_flags_json, @engine_size_id, @engine_size_json, @status, @updated_at, @updated_by
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          hosts_json = excluded.hosts_json,
          support_email = excluded.support_email,
          premium_deployment = excluded.premium_deployment,
          headless_config_json = excluded.headless_config_json,
          auth_config_json = excluded.auth_config_json,
          client_app_json = excluded.client_app_json,
          branding_json = excluded.branding_json,
          feature_flags_json = excluded.feature_flags_json,
          engine_size_id = excluded.engine_size_id,
          engine_size_json = excluded.engine_size_json,
          status = excluded.status,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `)
      .run(payload);
  }

  async insertAuditLog(entry: TenantAuditLogEntry): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO tenant_audit_log (tenant_id, action, payload_json, created_at, actor)
        VALUES (@tenant_id, @action, @payload_json, @created_at, @actor)
      `)
      .run(entry);
  }
}

export class CosmosTenantRegistryStore implements TenantRegistryStore {
  constructor(private readonly tenants: Container, private readonly audit: Container) {}

  async listTenants(): Promise<TenantRow[]> {
    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.updated_at DESC',
    };
    const { resources } = await this.tenants.items.query<TenantRow>(querySpec).fetchAll();
    return resources ?? [];
  }

  async getTenant(id: string): Promise<TenantRow | undefined> {
    try {
      const { resource } = await this.tenants.item(id, id).read<TenantRow>();
      return resource;
    } catch (error: any) {
      if (error?.code === 404) {
        return undefined;
      }
      throw error;
    }
  }

  async upsertTenant(payload: TenantRowWriteInput): Promise<void> {
    await this.tenants.items.upsert(payload);
  }

  async insertAuditLog(entry: TenantAuditLogEntry): Promise<void> {
    await this.audit.items.create({ id: randomUUID(), ...entry });
  }
}
