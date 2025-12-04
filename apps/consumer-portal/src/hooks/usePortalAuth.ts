import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildBffUrl, getBffBaseUrl, isBffEnabled } from '../utils/bff';

export type PortalAuthProvider = 'google' | 'microsoft' | 'enterprise' | 'custom';

export interface PortalUser {
  name: string;
  email: string;
  provider: PortalAuthProvider;
  roles: string[];
  avatarUrl?: string;
}

const DEFAULT_ROLES = ['LEARNER'];

const STORAGE_KEY = 'consumer-portal::auth';
const BFF_BASE_URL = getBffBaseUrl();
const BFF_ENABLED = isBffEnabled();

function readStoredUser(): PortalUser | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PortalUser;
    if (!parsed.email) {
      return null;
    }
    return {
      ...parsed,
      roles: Array.isArray(parsed.roles) && parsed.roles.length > 0 ? parsed.roles : DEFAULT_ROLES,
    };
  } catch {
    return null;
  }
}

type ProviderProfile = {
  name?: string;
  email?: string;
};

export function usePortalAuth() {
  const [user, setUser] = useState<PortalUser | null>(() => readStoredUser());
  const [checkingSession, setCheckingSession] = useState<boolean>(BFF_ENABLED);

  const persist = useCallback((next: PortalUser | null) => {
    setUser(next);
    if (typeof window === 'undefined') {
      return;
    }
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!BFF_ENABLED) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    async function hydrateSession() {
      try {
        const response = await fetch(buildBffUrl('/auth/session'), {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Not authenticated');
        }
        const data = (await response.json()) as {
          user: { email: string; name?: string; picture?: string; provider: PortalAuthProvider };
        };
        if (cancelled) {
          return;
        }
        persist({
          provider: data.user.provider ?? 'google',
          name: data.user.name ?? data.user.email,
          email: data.user.email,
          avatarUrl: data.user.picture,
          roles: DEFAULT_ROLES,
        });
      } catch {
        // swallow errors; user may still rely on custom dev logins
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }
    hydrateSession();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const loginWithProvider = useCallback((
    provider: PortalAuthProvider,
    roles: string[] = DEFAULT_ROLES,
    profile?: ProviderProfile,
  ) => {
    if (provider === 'google' && BFF_ENABLED) {
      window.location.href = buildBffUrl('/auth/google/login');
      return;
    }
    const now = new Date();
    const displayProvider = provider === 'google'
      ? 'Google'
      : provider === 'microsoft'
        ? 'Microsoft'
        : provider === 'enterprise'
          ? 'Enterprise'
          : 'Custom';
    const fallbackName = `${displayProvider} User`;
    const fallbackEmail = `${provider}.${now.getTime()}@example.com`;
    const trimmedName = profile?.name?.trim();
    const trimmedEmail = profile?.email?.trim();
    persist({
      provider,
      name: trimmedName && trimmedName.length > 0 ? trimmedName : fallbackName,
      email: trimmedEmail && trimmedEmail.length > 0 ? trimmedEmail : fallbackEmail,
      roles: roles.length > 0 ? roles : DEFAULT_ROLES,
    });
  }, [persist]);

  const loginCustom = useCallback((name: string, email: string, roles: string[] = DEFAULT_ROLES) => {
    persist({
      provider: 'custom',
      name,
      email,
      roles: roles.length > 0 ? roles : DEFAULT_ROLES,
    });
  }, [persist]);

  const logout = useCallback(async () => {
    if (BFF_ENABLED) {
      try {
        await fetch(buildBffUrl('/auth/logout'), {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // ignore network errors during logout
      }
    }
    persist(null);
  }, [persist]);

  return useMemo(() => ({ user, loginWithProvider, loginCustom, logout, checkingSession }), [user, loginWithProvider, loginCustom, logout, checkingSession]);
}