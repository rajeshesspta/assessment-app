import { describe, expect, it } from 'vitest';
import { buildTenantRuntimeBundle } from '../tenant-config-loader';
import type { TenantConfigBundle } from '../tenant-config';
import { createTenantConfig } from '../testing/test-utils';

describe('buildTenantRuntimeBundle', () => {
  it('derives lookup maps and metadata for each tenant', () => {
    const bundle: TenantConfigBundle = {
      version: 'test',
      tenants: [
        createTenantConfig(),
        createTenantConfig({
          tenantId: 'tenant-beta',
          name: 'Tenant Beta',
          hosts: ['beta.localhost:5000'],
          supportEmail: 'support@beta.test',
          headless: {
            baseUrl: 'http://headless.beta.test',
            apiKey: 'beta-key',
            tenantId: 'beta-tenant',
            actorRoles: ['CONTENT_AUTHOR'],
          },
          auth: {
            google: {
              clientId: 'beta-client-id',
              clientSecret: 'beta-secret',
              redirectUris: [
                'http://beta.localhost:5000/auth/google/callback',
                'http://beta-alt.localhost:5000/auth/google/callback',
              ],
            },
          },
          clientApp: {
            baseUrl: 'https://beta.app.local',
            landingPath: '/start',
          },
        }),
      ],
    };

    const runtime = buildTenantRuntimeBundle(bundle);
    const alpha = runtime.tenantsById.get('tenant-alpha');
    const beta = runtime.tenantsById.get('tenant-beta');

    expect(alpha?.clientAppOrigin).toBe('http://alpha.app.local:5173');
    expect(alpha?.landingRedirectUrl).toBe('http://alpha.app.local:5173/overview');
    expect(beta?.landingRedirectUrl).toBe('https://beta.app.local/start');

    expect(runtime.allowedOrigins.has('http://alpha.app.local:5173')).toBe(true);
    expect(runtime.allowedOrigins.has('https://beta.app.local')).toBe(true);

    expect(runtime.tenantsByHost.get('tenant.alpha.test')).toBe(alpha);
    expect(runtime.tenantsByHost.get('beta.localhost')).toBe(beta);

    expect(beta?.googleRedirectHostMap.get('beta.localhost')?.toString()).toBe('http://beta.localhost:5000/auth/google/callback');
    expect(beta?.googleRedirectHostMap.get('beta-alt.localhost')?.toString()).toBe('http://beta-alt.localhost:5000/auth/google/callback');
  });

  it('throws when bundle has no tenants', () => {
    const emptyBundle: TenantConfigBundle = { version: 'empty', tenants: [] };
    expect(() => buildTenantRuntimeBundle(emptyBundle)).toThrow(/at least one tenant/i);
  });

  it('rejects duplicate host assignments', () => {
    const bundle: TenantConfigBundle = {
      tenants: [
        createTenantConfig({ hosts: ['shared.localhost'] }),
        createTenantConfig({ tenantId: 'tenant-beta', hosts: ['shared.localhost'] }),
      ],
    };
    expect(() => buildTenantRuntimeBundle(bundle)).toThrow(/Host shared\.localhost/i);
  });

  it('rejects duplicate google redirect host mappings with conflicting urls', () => {
    const bundle: TenantConfigBundle = {
      tenants: [
        createTenantConfig({
          auth: {
            google: {
              clientId: 'client',
              clientSecret: 'secret',
              redirectUris: [
                'https://alpha.localhost/auth/google/callback',
                'https://alpha.localhost/auth/google/alt',
              ],
            },
          },
        }),
      ],
    };

    expect(() => buildTenantRuntimeBundle(bundle)).toThrow(/Duplicate Google redirect host mapping/i);
  });
});
