import { tenantTaxonomyConfigSchema, type TenantTaxonomyConfig } from '../../apps/control-plane-api/src/tenant-schema.js';

/**
 * Loads the taxonomy config for a tenant from the headless API.
 */
export async function getTenantTaxonomyConfig(tenantId: string): Promise<TenantTaxonomyConfig | undefined> {
  // The headless API base URL and API key should be set via env/config
  const baseUrl = process.env.HEADLESS_API_BASE_URL || 'http://localhost:3000';
  const apiKey = process.env.HEADLESS_API_KEY || 'dev-key';
  const url = `${baseUrl}/config/taxonomy`;
  const response = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
    },
  });
  if (!response.ok) return undefined;
  const data = await response.json();
  return tenantTaxonomyConfigSchema.parse(data);
}