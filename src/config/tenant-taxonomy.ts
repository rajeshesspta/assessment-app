import { tenantTaxonomyConfigSchema, type TenantTaxonomyConfig } from '../../apps/control-plane-api/src/tenant-schema.js';
import { getTenantConfig } from './tenant-config-loader.js';

/**
 * Loads the taxonomy config for a tenant from the control plane bundle/config.
 */
export async function getTenantTaxonomyConfig(tenantId: string): Promise<TenantTaxonomyConfig | undefined> {
  const config = await getTenantConfig(tenantId);
  if (!config?.taxonomy) return undefined;
  return tenantTaxonomyConfigSchema.parse(config.taxonomy);
}