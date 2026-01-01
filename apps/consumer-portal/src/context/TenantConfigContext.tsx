import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildBffUrl, isBffEnabled } from '../utils/bff';

type TenantBranding = {
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  backgroundImageUrl?: string;
};

type TenantTaxonomy = {
  categories: string[];
  tags: {
    predefined: string[];
    allowCustom: boolean;
  };
  metadataFields: Array<{
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
    required: boolean;
    allowedValues?: (string | number | boolean)[];
    description?: string;
  }>;
};

type TenantConfig = {
  tenantId: string;
  headlessTenantId: string;
  name: string;
  supportEmail?: string;
  premiumDeployment: boolean;
  branding: TenantBranding;
  featureFlags: Record<string, boolean>;
  taxonomy?: TenantTaxonomy;
  clientApp: {
    baseUrl: string;
    landingPath: string;
  };
};

type TenantConfigState = {
  config: TenantConfig | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
};

const DEFAULT_BRANDING: TenantBranding = {
  primaryColor: '#4f46e5',
  accentColor: '#6366f1',
};

const DEFAULT_CONFIG: TenantConfig = {
  tenantId: 'default-tenant',
  headlessTenantId: 'dev-tenant',
  name: 'Assessment App',
  supportEmail: 'support@example.com',
  premiumDeployment: false,
  branding: DEFAULT_BRANDING,
  featureFlags: {},
  clientApp: {
    baseUrl: 'http://localhost:5173',
    landingPath: '/overview',
  },
};

const TenantConfigContext = createContext<TenantConfigState | undefined>(undefined);

function applyBranding(branding?: TenantBranding) {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  const activeTheme = root.dataset.portalTheme ?? 'tenant';
  if (activeTheme !== 'tenant') {
    return;
  }
  const primary = branding?.primaryColor ?? DEFAULT_BRANDING.primaryColor!;
  const accent = branding?.accentColor ?? DEFAULT_BRANDING.accentColor!;
  root.style.setProperty('--tenant-brand-primary', primary);
  root.style.setProperty('--tenant-brand-accent', accent);
  if (branding?.backgroundImageUrl) {
    root.style.setProperty('--tenant-brand-background-image', `url(${branding.backgroundImageUrl})`);
  } else {
    root.style.removeProperty('--tenant-brand-background-image');
  }
}

export function TenantConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<TenantConfig | null>(() => (isBffEnabled() ? null : DEFAULT_CONFIG));
  const [loading, setLoading] = useState<boolean>(isBffEnabled());
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!isBffEnabled()) {
      setConfig(DEFAULT_CONFIG);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(buildBffUrl('/config'), { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to load tenant configuration');
      }
      const payload = await response.json() as TenantConfig;
      setConfig(payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Failed to load tenant configuration');
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      applyBranding(config.branding);
      if (config.name) {
        document.title = `${config.name} Portal`;
      }
    }
  }, [config]);

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const nextTheme = (event as CustomEvent<string>).detail;
      if (nextTheme === 'tenant' && config) {
        applyBranding(config.branding);
      }
    }

    window.addEventListener('portal-theme-change', handleThemeChange as EventListener);
    return () => window.removeEventListener('portal-theme-change', handleThemeChange as EventListener);
  }, [config]);

  const value = useMemo<TenantConfigState>(() => ({ config, loading, error, refresh: fetchConfig }), [config, loading, error, fetchConfig]);

  return (
    <TenantConfigContext.Provider value={value}>
      {children}
    </TenantConfigContext.Provider>
  );
}

export function useTenantConfig() {
  const context = useContext(TenantConfigContext);
  if (!context) {
    throw new Error('useTenantConfig must be used within a TenantConfigProvider');
  }
  return context;
}
