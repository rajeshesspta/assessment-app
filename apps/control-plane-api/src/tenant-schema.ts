// --- Taxonomy config for per-tenant item metadata ---
export const taxonomyFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'array', 'object']),
  required: z.boolean().default(false),
  allowedValues: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  description: z.string().optional(),
});

export const tenantTaxonomyConfigSchema = z.object({
  categories: z.array(z.string()).default([]),
  tags: z.object({
    predefined: z.array(z.string()).default([]),
    allowCustom: z.boolean().default(true),
  }).default({ predefined: [], allowCustom: true }),
  metadataFields: z.array(taxonomyFieldSchema).default([]),
});

export type TenantTaxonomyConfig = z.infer<typeof tenantTaxonomyConfigSchema>;

import { z } from 'zod';

const sqliteDbSchema = z
  .object({
    provider: z.literal('sqlite'),
    filePath: z.string().min(1).optional(),
    filePattern: z.string().min(1).optional(),
    options: z.record(z.string()).optional(),
  })
  .refine(value => Boolean(value.filePath || value.filePattern), {
    message: 'Provide a SQLite file path or pattern',
    path: ['filePath'],
  });

const cosmosDbSchema = z.object({
  provider: z.literal('cosmos'),
  connectionStringRef: z.string().min(1),
  databaseId: z.string().min(1),
  containerId: z.string().min(1),
  preferredRegions: z.array(z.string().min(1)).optional(),
  options: z.record(z.string()).optional(),
});

export const tenantDbConfigSchema = z.union([sqliteDbSchema, cosmosDbSchema]);

export const tenantBrandingSchema = z
  .object({
    logoUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#?[0-9a-fA-F]{3,8}$/).optional(),
    accentColor: z.string().regex(/^#?[0-9a-fA-F]{3,8}$/).optional(),
    backgroundImageUrl: z.string().url().optional(),
  })
  .default({});

export const tenantFeatureFlagSchema = z.record(z.boolean()).default({});

const tenantEngineMetadataSchema = z.record(z.unknown()).optional();

export const tenantEngineSizeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().max(280).optional(),
  metadata: tenantEngineMetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const tenantHeadlessStoredSchema = z.object({
  baseUrl: z.string().url(),
  apiKeyRef: z.string().min(1),
  tenantId: z.string().min(1),
  actorRoles: z.array(z.string().min(1)).min(1),
  db: tenantDbConfigSchema.optional(),
});

export const tenantHeadlessSchema = tenantHeadlessStoredSchema.extend({
  tenantId: z.string().uuid(),
});

export const tenantClientAppSchema = z.object({
  baseUrl: z.string().url(),
  landingPath: z
    .string()
    .default('/overview')
    .transform(value => (value.startsWith('/') ? value : `/${value}`)),
});

export const tenantSocialAuthSchema = z.object({
  enabled: z.boolean().default(true),
  clientIdRef: z.string().min(1),
  clientSecretRef: z.string().min(1),
  redirectUris: z.array(z.string().url()).min(1),
});

const tenantAuthSchema = z
  .object({
    google: tenantSocialAuthSchema.optional(),
    microsoft: tenantSocialAuthSchema.optional(),
  })
  .refine(value => {
    // Allow an empty auth object (no providers configured) during creation.
    // If any provider keys are present, require at least one to be configured.
    if (!value || Object.keys(value).length === 0) return true;
    return Boolean(value.google || value.microsoft);
  }, {
    message: 'At least one social identity provider must be configured',
    path: ['google'],
  });

const tenantRegistryBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hosts: z.array(z.string().min(1)).min(1),
  supportEmail: z.string().email(),
  premiumDeployment: z.boolean().default(false),
  headless: tenantHeadlessStoredSchema,
  auth: tenantAuthSchema.optional(),
  clientApp: tenantClientAppSchema,
  branding: tenantBrandingSchema,
  featureFlags: tenantFeatureFlagSchema,
  engineSize: tenantEngineSizeSchema.optional(),
  taxonomy: tenantTaxonomyConfigSchema.optional(),
  status: z.enum(['active', 'paused', 'deleting']).default('active'),
});

export const tenantRegistryStoredSchema = tenantRegistryBaseSchema;

export const tenantRegistryInputSchema = tenantRegistryBaseSchema.extend({
  id: z.string().uuid(),
  headless: tenantHeadlessSchema,
});

export type TenantRegistryInput = z.infer<typeof tenantRegistryInputSchema>;

const tenantConfigSocialAuthSchema = z.object({
  enabled: z.boolean().default(true),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUris: z.array(z.string().url()).min(1),
});

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
    db: tenantDbConfigSchema.optional(),
  }),
  auth: z
    .object({
      google: tenantConfigSocialAuthSchema.optional(),
      microsoft: tenantConfigSocialAuthSchema.optional(),
    })
    .optional(),
  clientApp: tenantClientAppSchema,
  branding: tenantBrandingSchema,
  featureFlags: tenantFeatureFlagSchema,
  engineSize: tenantEngineSizeSchema.optional(),
  taxonomy: tenantTaxonomyConfigSchema.optional(),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export const tenantConfigBundleSchema = z.object({
  version: z.string().default('control-plane'),
  updatedAt: z.string().datetime(),
  tenants: z.array(tenantConfigSchema),
});

export type TenantConfigBundle = z.infer<typeof tenantConfigBundleSchema>;
