import { z } from 'zod';
import type { TenantRegistryStore, TenantRow, TenantRowWriteInput, TenantAuditLogEntry } from '../stores/tenant-registry-store';
import {
  tenantConfigBundleSchema,
  tenantRegistryInputSchema,
  tenantRegistryStoredSchema,
  type TenantConfigBundle,
  type TenantRegistryInput,
} from '../tenant-schema';

const tenantRecordSchema = tenantRegistryStoredSchema.extend({
  updatedAt: z.string(),
  updatedBy: z.string(),
});

export type TenantRecord = z.infer<typeof tenantRecordSchema>;

export class TenantRegistryRepository {
  constructor(private readonly store: TenantRegistryStore) {}

  async listTenants(): Promise<TenantRecord[]> {
    const rows = await this.store.listTenants();
    return rows.map(row => this.rowToRecord(row));
  }

  async getTenant(id: string): Promise<TenantRecord | undefined> {
    const row = await this.store.getTenant(id);
    return row ? this.rowToRecord(row) : undefined;
  }

  async upsertTenant(input: TenantRegistryInput, actor: string): Promise<TenantRecord> {
    const record = tenantRegistryInputSchema.parse(input);
    const now = new Date().toISOString();
    const row: TenantRowWriteInput = {
      id: record.id,
      name: record.name,
      hosts_json: JSON.stringify(record.hosts),
      support_email: record.supportEmail,
      premium_deployment: record.premiumDeployment ? 1 : 0,
      headless_config_json: JSON.stringify(record.headless),
      auth_config_json: JSON.stringify(record.auth ?? {}),
      client_app_json: JSON.stringify(record.clientApp),
      branding_json: JSON.stringify(record.branding),
      feature_flags_json: JSON.stringify(record.featureFlags),
      status: record.status,
      updated_at: now,
      updated_by: actor,
    };
    await this.store.upsertTenant(row);

    const auditEntry: TenantAuditLogEntry = {
      tenant_id: record.id,
      action: 'UPSERT',
      payload_json: JSON.stringify(record),
      created_at: now,
      actor,
    };
    await this.store.insertAuditLog(auditEntry);

    return (await this.getTenant(record.id)) as TenantRecord;
  }

  async buildTenantBundle(): Promise<TenantConfigBundle> {
    const tenants = (await this.listTenants())
      .filter(tenant => tenant.status === 'active')
      .map(tenant => {
        const auth: Record<string, unknown> = {};
        if (tenant.auth?.google) {
          auth.google = {
            enabled: tenant.auth.google.enabled ?? true,
            clientId: (tenant.auth as any).google.clientIdRef,
            clientSecret: (tenant.auth as any).google.clientSecretRef,
            redirectUris: (tenant.auth as any).google.redirectUris,
          };
        }
        if (tenant.auth?.microsoft) {
          auth.microsoft = {
            enabled: tenant.auth.microsoft.enabled ?? true,
            clientId: (tenant.auth as any).microsoft.clientIdRef,
            clientSecret: (tenant.auth as any).microsoft.clientSecretRef,
            redirectUris: (tenant.auth as any).microsoft.redirectUris,
          };
        }

        return {
          tenantId: tenant.id,
          name: tenant.name,
          hosts: tenant.hosts,
          supportEmail: tenant.supportEmail,
          premiumDeployment: tenant.premiumDeployment,
          headless: {
            baseUrl: tenant.headless.baseUrl,
            apiKey: tenant.headless.apiKeyRef,
            tenantId: tenant.headless.tenantId,
            actorRoles: tenant.headless.actorRoles,
          },
          auth,
          clientApp: tenant.clientApp,
          branding: tenant.branding,
          featureFlags: tenant.featureFlags,
          status: tenant.status,
        };
      });

    return tenantConfigBundleSchema.parse({
      updatedAt: new Date().toISOString(),
      tenants,
    });
  }

  private rowToRecord(row: TenantRow): TenantRecord {
    return tenantRecordSchema.parse({
      id: row.id,
      name: row.name,
      hosts: JSON.parse(row.hosts_json),
      supportEmail: row.support_email,
      premiumDeployment: Boolean(row.premium_deployment),
      headless: JSON.parse(row.headless_config_json),
      auth: JSON.parse(row.auth_config_json || '{}'),
      clientApp: JSON.parse(row.client_app_json),
      branding: JSON.parse(row.branding_json),
      featureFlags: JSON.parse(row.feature_flags_json),
      status: row.status,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  }
}
