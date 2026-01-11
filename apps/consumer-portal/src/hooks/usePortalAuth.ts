import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildBffUrl, getBffBaseUrl, isBffEnabled } from '../utils/bff';

export type PortalAuthProvider = 'google' | 'microsoft' | 'enterprise' | 'custom';

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  provider: PortalAuthProvider;
  roles: string[];
  avatarUrl?: string;
}

const DEFAULT_ROLES = ['LEARNER'];

function deriveNameFromEmail(address: string) {
  const localPart = address.split('@')[0] ?? '';
  if (!localPart) {
    return undefined;
  }
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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

  const loadSessionUser = useCallback(async (): Promise<PortalUser | null> => {
    if (!BFF_ENABLED) {
      return null;
    }
    const response = await fetch(buildBffUrl('/auth/session'), {
      credentials: 'include',
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      user: {
        sub: string;
        email: string;
        name?: string;
        picture?: string;
        provider: PortalAuthProvider;
        roles?: string[];
      };
    };
    if (!data?.user?.email) {
      return null;
    }
    return {
      id: data.user.sub,
      provider: data.user.provider ?? 'google',
      name: data.user.name ?? data.user.email,
      email: data.user.email,
      avatarUrl: data.user.picture,
      roles: Array.isArray(data.user.roles) && data.user.roles.length > 0 ? data.user.roles : DEFAULT_ROLES,
    };
  }, []);

  useEffect(() => {
    if (!BFF_ENABLED) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sessionUser = await loadSessionUser();
        if (!cancelled) {
          if (sessionUser) {
            persist(sessionUser);
          } else {
            persist(null);
          }
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    })().catch(() => {
      if (!cancelled) {
        setCheckingSession(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadSessionUser, persist]);

  const loginWithProvider = useCallback((
    provider: PortalAuthProvider,
    roles: string[] = DEFAULT_ROLES,
    profile?: ProviderProfile,
    returnUrl?: string,
  ) => {
    if (provider === 'google' && BFF_ENABLED) {
      const url = new URL(buildBffUrl('/auth/google/login'));
      if (returnUrl) {
        url.searchParams.set('returnUrl', returnUrl);
      }
      window.location.href = url.toString();
      return;
    }
    if (provider === 'microsoft' && BFF_ENABLED) {
      const url = new URL(buildBffUrl('/auth/microsoft/login'));
      if (returnUrl) {
        url.searchParams.set('returnUrl', returnUrl);
      }
      window.location.href = url.toString();
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
      id: trimmedEmail || `user-${now.getTime()}`,
      provider,
      name: trimmedName && trimmedName.length > 0 ? trimmedName : fallbackName,
      email: trimmedEmail && trimmedEmail.length > 0 ? trimmedEmail : fallbackEmail,
      roles: roles.length > 0 ? roles : DEFAULT_ROLES,
    });
  }, [persist]);

  const loginCustom = useCallback(async (details: { email: string; password?: string; roles?: string[] }) => {
    const normalizedEmail = details.email.trim();
    if (BFF_ENABLED) {
      const trimmedPassword = details.password?.trim();
      const body: Record<string, string> = { email: normalizedEmail };
      if (trimmedPassword) {
        body.password = trimmedPassword;
      }
      const response = await fetch(buildBffUrl('/auth/local'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        let errorMessage = 'Unable to authenticate';
        try {
          const data = await response.json();
          errorMessage = data?.error ?? errorMessage;
        } catch {
          try {
            errorMessage = await response.text();
          } catch {
            // ignore
          }
        }
        throw new Error(errorMessage);
      }
      const sessionUser = await loadSessionUser();
      if (!sessionUser) {
        throw new Error('Failed to load session after authentication');
      }
      persist(sessionUser);
      return;
    }
    const fallbackRoles = details.roles && details.roles.length > 0 ? details.roles : DEFAULT_ROLES;
    persist({
      id: normalizedEmail || `user-${Date.now()}`,
      provider: 'custom',
      name: deriveNameFromEmail(normalizedEmail) ?? normalizedEmail,
      email: normalizedEmail,
      roles: fallbackRoles,
    });
  }, [loadSessionUser, persist]);

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