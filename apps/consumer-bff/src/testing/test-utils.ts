import type { TenantConfig } from '../tenant-config';

export function createTenantConfig(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: 'tenant-alpha',
    name: 'Tenant Alpha',
    hosts: ['tenant.alpha.test:4000'],
    supportEmail: 'support@alpha.test',
    premiumDeployment: false,
    headless: {
      baseUrl: 'http://headless.alpha.test',
      apiKey: 'alpha-key',
      tenantId: 'alpha-tenant',
      actorRoles: ['LEARNER'],
    },
    auth: {
      google: {
        clientId: 'alpha-client-id',
        clientSecret: 'alpha-secret',
        redirectUris: ['http://tenant.alpha.test:4000/auth/google/callback'],
      },
    },
    clientApp: {
      baseUrl: 'http://alpha.app.local:5173',
      landingPath: '/overview',
    },
    branding: {},
    featureFlags: {},
    ...overrides,
  } satisfies TenantConfig;
}
