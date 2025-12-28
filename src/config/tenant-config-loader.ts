import { tenantConfigBundleSchema, type TenantConfig } from '../../apps/control-plane-api/src/tenant-schema.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const BUNDLE_PATH = process.env.CONTROL_PLANE_BUNDLE_PATH || path.join(process.cwd(), 'tenants.json');

let bundleCache: { updatedAt: string; tenants: TenantConfig[] } | null = null;

/**
 * Loads the tenant config bundle from disk (or cache).
 */
export async function getTenantConfig(tenantId: string): Promise<TenantConfig | undefined> {
  if (!bundleCache) {
    const raw = await fs.readFile(BUNDLE_PATH, 'utf8');
    const bundle = tenantConfigBundleSchema.parse(JSON.parse(raw));
    bundleCache = { updatedAt: bundle.updatedAt, tenants: bundle.tenants };
  }
  return bundleCache.tenants.find(t => t.tenantId === tenantId);
}