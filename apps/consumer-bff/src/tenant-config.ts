import { z } from 'zod';

const tenantBrandingSchema = z
  .object({
    logoUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#?[0-9a-fA-F]{3,8}$/).optional(),
    accentColor: z.string().regex(/^#?[0-9a-fA-F]{3,8}$/).optional(),
    backgroundImageUrl: z.string().url().optional(),
  })
  .default({});

const tenantFeatureFlagSchema = z.record(z.boolean()).default({});

const taxonomyFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'array', 'object']),
  required: z.boolean().default(false),
  allowedValues: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  description: z.string().optional(),
});

const tenantTaxonomySchema = z.object({
  categories: z.array(z.string()).default([]),
  tags: z.object({
    predefined: z.array(z.string()).default([]),
    allowCustom: z.boolean().default(true),
  }).default({ predefined: [], allowCustom: true }),
  metadataFields: z.array(taxonomyFieldSchema).default([]),
});

const tenantHeadlessSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  tenantId: z.string().min(1),
  actorRoles: z.array(z.string().min(1)).min(1),
});

const tenantClientAppSchema = z.object({
  baseUrl: z.string().url(),
  landingPath: z
    .string()
    .default('/overview')
    .transform(value => (value.startsWith('/') ? value : `/${value}`)),
});

const tenantGoogleAuthSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUris: z.array(z.string().url()).min(1),
});

const tenantAuthSchema = z.object({
  google: tenantGoogleAuthSchema,
});

export const tenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
  hosts: z.array(z.string().min(1)).min(1),
  supportEmail: z.string().email(),
  premiumDeployment: z.boolean().default(false),
  headless: tenantHeadlessSchema,
  auth: tenantAuthSchema,
  clientApp: tenantClientAppSchema,
  branding: tenantBrandingSchema,
  featureFlags: tenantFeatureFlagSchema,
  taxonomy: tenantTaxonomySchema.optional(),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export const tenantConfigBundleSchema = z.object({
  version: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
  tenants: z.array(tenantConfigSchema),
});

export type TenantConfigBundle = z.infer<typeof tenantConfigBundleSchema>;

export type HostMatchResult = {
  tenant: TenantConfig;
  matchedHost: string;
};

export function normalizeHost(hostHeader?: string) {
  if (!hostHeader) {
    return undefined;
  }
  return hostHeader.split(':')[0]?.trim().toLowerCase();
}

export class TenantResolutionError extends Error {}

export function parseTenantBundle(input: unknown): TenantConfigBundle {
  return tenantConfigBundleSchema.parse(input);
}

export function resolveTenantByHost(bundle: TenantConfigBundle, hostHeader?: string): HostMatchResult | undefined {
  const normalizedHost = normalizeHost(hostHeader);
  if (!normalizedHost) {
    return undefined;
  }
  for (const tenant of bundle.tenants) {
    for (const host of tenant.hosts) {
      if (normalizeHost(host) === normalizedHost) {
        return { tenant, matchedHost: host };
      }
    }
  }
  return undefined;
}

export function requireTenantByHost(bundle: TenantConfigBundle, hostHeader?: string): HostMatchResult {
  const result = resolveTenantByHost(bundle, hostHeader);
  if (!result) {
    throw new TenantResolutionError(`No tenant configured for host ${hostHeader ?? '<unknown>'}`);
  }
  return result;
}

export function getTenantById(bundle: TenantConfigBundle, tenantId: string): TenantConfig | undefined {
  return bundle.tenants.find(tenant => tenant.tenantId === tenantId);
}
