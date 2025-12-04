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

const tenantHeadlessSchema = z.object({
  baseUrl: z.string().url(),
  apiKeyRef: z.string().min(1),
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
  clientIdRef: z.string().min(1),
  clientSecretRef: z.string().min(1),
  redirectUris: z.array(z.string().url()).min(1),
});

const tenantAuthSchema = z.object({
  google: tenantGoogleAuthSchema,
});

export const tenantRegistryInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hosts: z.array(z.string().min(1)).min(1),
  supportEmail: z.string().email(),
  premiumDeployment: z.boolean().default(false),
  headless: tenantHeadlessSchema,
  auth: tenantAuthSchema,
  clientApp: tenantClientAppSchema,
  branding: tenantBrandingSchema,
  featureFlags: tenantFeatureFlagSchema,
  status: z.enum(['active', 'paused', 'deleting']).default('active'),
});

export type TenantRegistryInput = z.infer<typeof tenantRegistryInputSchema>;

export const tenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
  hosts: z.array(z.string().min(1)).min(1),
  supportEmail: z.string().email(),
  premiumDeployment: z.boolean().default(false),
  headless: z.object({
    baseUrl: z.string().url(),
    apiKey: z.string().min(1),
    tenantId: z.string().min(1),
    actorRoles: z.array(z.string().min(1)).min(1),
  }),
  auth: z.object({
    google: z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      redirectUris: z.array(z.string().url()).min(1),
    }),
  }),
  clientApp: tenantClientAppSchema,
  branding: tenantBrandingSchema,
  featureFlags: tenantFeatureFlagSchema,
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export const tenantConfigBundleSchema = z.object({
  version: z.string().default('control-plane'),
  updatedAt: z.string().datetime(),
  tenants: z.array(tenantConfigSchema),
});

export type TenantConfigBundle = z.infer<typeof tenantConfigBundleSchema>;
