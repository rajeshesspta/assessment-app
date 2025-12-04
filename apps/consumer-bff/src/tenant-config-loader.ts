import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TenantConfig,
  TenantConfigBundle,
  parseTenantBundle,
  normalizeHost,
} from './tenant-config';

export type TenantRuntime = TenantConfig & {
  clientAppUrl: URL;
  clientAppOrigin: string;
  landingRedirectUrl: string;
  googleRedirectUrls: URL[];
  googleRedirectHostMap: Map<string, URL>;
};

export type TenantRuntimeBundle = {
  raw: TenantConfigBundle;
  tenants: TenantRuntime[];
  tenantsById: Map<string, TenantRuntime>;
  tenantsByHost: Map<string, TenantRuntime>;
  allowedOrigins: Set<string>;
};

export type TenantConfigControlPlaneSource = {
  baseUrl: string;
  apiKey: string;
  path?: string;
  fetchImpl?: typeof fetch;
};

export type TenantConfigSourceOptions = {
  path?: string;
  json?: string;
  controlPlane?: TenantConfigControlPlaneSource;
};

function parseBundleFromString(payload: string): TenantConfigBundle {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parseTenantBundle(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse tenant config JSON payload');
    }
    throw error;
  }
}

async function fetchTenantBundleFromControlPlane(source: TenantConfigControlPlaneSource): Promise<TenantConfigBundle> {
  const target = new URL(source.path ?? 'control/tenant-bundle', source.baseUrl);
  const fetchImpl = source.fetchImpl ?? fetch;
  const response = await fetchImpl(target, {
    headers: {
      'x-control-plane-key': source.apiKey,
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Control Plane request failed with status ${response.status}`);
  }
  const payload = await response.json();
  return parseTenantBundle(payload);
}

export async function loadTenantConfigBundleFromSource(options: TenantConfigSourceOptions): Promise<TenantConfigBundle> {
  if (options.controlPlane) {
    return fetchTenantBundleFromControlPlane(options.controlPlane);
  }
  if (options.json) {
    return parseBundleFromString(options.json);
  }
  if (options.path) {
    const resolvedPath = path.isAbsolute(options.path)
      ? options.path
      : path.join(process.cwd(), options.path);
    const fileContents = readFileSync(resolvedPath, 'utf-8');
    return parseBundleFromString(fileContents);
  }
  throw new Error('TENANT_CONFIG source not provided (path, json, or control plane)');
}

export function buildTenantRuntimeBundle(bundle: TenantConfigBundle): TenantRuntimeBundle {
  if (bundle.tenants.length === 0) {
    throw new Error('Tenant config bundle must include at least one tenant');
  }

  const tenants: TenantRuntime[] = [];
  const tenantsById = new Map<string, TenantRuntime>();
  const tenantsByHost = new Map<string, TenantRuntime>();
  const allowedOrigins = new Set<string>();

  for (const tenant of bundle.tenants) {
    const clientAppUrl = new URL(tenant.clientApp.baseUrl);
    const landingRedirectUrl = new URL(tenant.clientApp.landingPath, clientAppUrl).toString();
    const googleRedirectUrls = tenant.auth.google.redirectUris.map(uri => new URL(uri));
    const googleRedirectHostMap = new Map<string, URL>();
    for (const redirectUrl of googleRedirectUrls) {
      const normalizedHost = normalizeHost(redirectUrl.host);
      if (!normalizedHost) {
        continue;
      }
      const existing = googleRedirectHostMap.get(normalizedHost);
      if (existing && existing.toString() !== redirectUrl.toString()) {
        throw new Error(`Duplicate Google redirect host mapping detected for ${normalizedHost}`);
      }
      googleRedirectHostMap.set(normalizedHost, redirectUrl);
    }

    const runtimeTenant: TenantRuntime = {
      ...tenant,
      clientAppUrl,
      clientAppOrigin: clientAppUrl.origin,
      landingRedirectUrl,
      googleRedirectUrls,
      googleRedirectHostMap,
    };

    if (tenantsById.has(runtimeTenant.tenantId)) {
      throw new Error(`Duplicate tenantId detected: ${runtimeTenant.tenantId}`);
    }

    tenants.push(runtimeTenant);
    tenantsById.set(runtimeTenant.tenantId, runtimeTenant);
    allowedOrigins.add(runtimeTenant.clientAppOrigin);

    for (const host of tenant.hosts) {
      const normalizedHost = normalizeHost(host);
      if (!normalizedHost) {
        continue;
      }
      const existingTenant = tenantsByHost.get(normalizedHost);
      if (existingTenant && existingTenant.tenantId !== runtimeTenant.tenantId) {
        throw new Error(`Host ${host} is already assigned to tenant ${existingTenant.tenantId}`);
      }
      tenantsByHost.set(normalizedHost, runtimeTenant);
    }
  }

  return {
    raw: bundle,
    tenants,
    tenantsById,
    tenantsByHost,
    allowedOrigins,
  };
}
