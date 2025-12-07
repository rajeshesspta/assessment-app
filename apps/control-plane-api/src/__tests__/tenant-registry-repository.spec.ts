import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantRegistryRepository } from '../repositories/tenant-registry';
import type {
  TenantAuditLogEntry,
  TenantRegistryStore,
  TenantRow,
  TenantRowWriteInput,
} from '../stores/tenant-registry-store';

function buildTenantRow(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: 'tenant-alpha',
    name: 'Tenant Alpha',
    hosts_json: JSON.stringify(['alpha.localhost']),
    support_email: 'support@alpha.test',
    premium_deployment: 0,
    headless_config_json: JSON.stringify({
      baseUrl: 'https://headless.alpha.test',
      apiKeyRef: 'alpha-headless-key',
      tenantId: 'alpha-tenant',
      actorRoles: ['CONTENT_AUTHOR'],
    }),
    auth_config_json: JSON.stringify({
      google: {
        enabled: true,
        clientIdRef: 'alpha-google-client',
        clientSecretRef: 'alpha-google-secret',
        redirectUris: ['https://alpha.localhost/auth/google/callback'],
      },
    }),
    client_app_json: JSON.stringify({
      baseUrl: 'https://alpha.app.local',
      landingPath: '/overview',
    }),
    branding_json: JSON.stringify({ primaryColor: '#111111' }),
    feature_flags_json: JSON.stringify({ analytics: true }),
    status: 'active',
    updated_at: '2024-01-01T00:00:00.000Z',
    updated_by: 'system',
    ...overrides,
  } satisfies TenantRow;
}

describe('TenantRegistryRepository', () => {
  let rows: Record<string, TenantRow>;
  let auditLog: TenantAuditLogEntry[];
  let store: TenantRegistryStore;
  let repository: TenantRegistryRepository;

  beforeEach(() => {
    rows = {};
    auditLog = [];

    const listTenants = vi.fn(async () => Object.values(rows));
    const getTenant = vi.fn(async (id: string) => rows[id]);
    const upsertTenant = vi.fn(async (payload: TenantRowWriteInput) => {
      rows[payload.id] = { ...payload };
    });
    const insertAuditLog = vi.fn(async (entry: TenantAuditLogEntry) => {
      auditLog.push(entry);
    });

    store = {
      listTenants,
      getTenant,
      upsertTenant,
      insertAuditLog,
    } satisfies TenantRegistryStore;

    repository = new TenantRegistryRepository(store);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists tenants using hydrated records', async () => {
    const row = buildTenantRow({ premium_deployment: 1 });
    rows[row.id] = row;

    const [record] = await repository.listTenants();

    expect(record).toMatchObject({
      id: 'tenant-alpha',
      hosts: ['alpha.localhost'],
      premiumDeployment: true,
      headless: { apiKeyRef: 'alpha-headless-key', tenantId: 'alpha-tenant' },
      auth: { google: { clientIdRef: 'alpha-google-client' } },
      updatedBy: 'system',
    });
  });

  it('upserts tenant payloads and writes audit entries', async () => {
    const tenantUuid = '11111111-2222-4333-8444-555555555555';
    const headlessUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const input = {
      id: tenantUuid,
      name: 'Tenant Beta',
      hosts: ['beta.localhost'],
      supportEmail: 'support@beta.test',
      premiumDeployment: true,
      headless: {
        baseUrl: 'https://headless.beta.test',
        apiKeyRef: 'beta-headless-key',
        tenantId: headlessUuid,
        actorRoles: ['TENANT_ADMIN'],
      },
      auth: {
        google: {
          enabled: true,
          clientIdRef: 'beta-google-client',
          clientSecretRef: 'beta-google-secret',
          redirectUris: ['https://beta.localhost/auth/google/callback'],
        },
      },
      clientApp: {
        baseUrl: 'https://beta.app.local',
        landingPath: 'home',
      },
      branding: { primaryColor: '#222' },
      featureFlags: { analytics: true },
      status: 'active' as const,
    };

    const record = await repository.upsertTenant(input, 'super-admin');

    expect(store.upsertTenant).toHaveBeenCalledTimes(1);
    const storedRow = rows[input.id];
    expect(storedRow).toBeDefined();
    expect(storedRow.hosts_json).toBe(JSON.stringify(input.hosts));
    expect(storedRow.headless_config_json).toBe(JSON.stringify(input.headless));
    expect(storedRow.client_app_json).toContain('home');

    expect(auditLog).toHaveLength(1);
    expect(auditLog[0]).toMatchObject({
      tenant_id: tenantUuid,
      actor: 'super-admin',
      action: 'UPSERT',
    });
    expect(JSON.parse(auditLog[0].payload_json)).toMatchObject({ id: tenantUuid });

    expect(record.clientApp.landingPath).toBe('/home');
    expect(record.updatedBy).toBe('super-admin');
  });

  it('builds tenant bundles with only active tenants', async () => {
    rows['tenant-alpha'] = buildTenantRow({
      headless_config_json: JSON.stringify({
        baseUrl: 'https://alpha-headless.test',
        apiKeyRef: 'alpha-key',
        tenantId: 'alpha-tenant',
        actorRoles: ['CONTENT_AUTHOR'],
      }),
    });
    rows['tenant-paused'] = buildTenantRow({
      id: 'tenant-paused',
      name: 'Tenant Paused',
      status: 'paused',
      hosts_json: JSON.stringify(['paused.localhost']),
    });

    const bundle = await repository.buildTenantBundle();

    expect(bundle.tenants).toHaveLength(1);
    expect(bundle.updatedAt).toBe('2024-03-01T00:00:00.000Z');
    expect(bundle.tenants[0]).toMatchObject({
      tenantId: 'tenant-alpha',
      headless: { apiKey: 'alpha-key' },
      auth: { google: { clientId: 'alpha-google-client' } },
    });
  });

  it('normalizes legacy auth provider shapes', async () => {
    const legacyRow = buildTenantRow({
      id: 'legacy-tenant',
      auth_config_json: JSON.stringify({
        google: {
          clientId: 'legacy-google-client',
          clientSecret: 'legacy-google-secret',
          redirectUri: 'https://legacy.app/auth/google/callback',
        },
        microsoft: {
          enabled: false,
          clientIdRef: 'legacy-ms-client',
          clientSecret: 'legacy-ms-secret',
          redirectUris: {
            primary: 'https://legacy.app/auth/microsoft/callback',
          },
        },
      }),
    });
    rows[legacyRow.id] = legacyRow;

    const record = await repository.getTenant('legacy-tenant');

    expect(record?.auth?.google).toMatchObject({
      enabled: true,
      clientIdRef: 'legacy-google-client',
      clientSecretRef: 'legacy-google-secret',
      redirectUris: ['https://legacy.app/auth/google/callback'],
    });
    expect(record?.auth?.microsoft).toMatchObject({
      enabled: false,
      clientIdRef: 'legacy-ms-client',
      clientSecretRef: 'legacy-ms-secret',
      redirectUris: ['https://legacy.app/auth/microsoft/callback'],
    });
  });
});