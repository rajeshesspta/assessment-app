import { useCallback, useMemo, useState } from 'react';

export type PortalAuthProvider = 'google' | 'microsoft' | 'custom';

export interface PortalUser {
  name: string;
  email: string;
  provider: PortalAuthProvider;
}

const STORAGE_KEY = 'consumer-portal::auth';

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
    return parsed;
  } catch {
    return null;
  }
}

export function usePortalAuth() {
  const [user, setUser] = useState<PortalUser | null>(() => readStoredUser());

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

  const loginWithProvider = useCallback((provider: PortalAuthProvider) => {
    const now = new Date();
    const displayProvider = provider === 'google' ? 'Google' : provider === 'microsoft' ? 'Microsoft' : 'Custom';
    persist({
      provider,
      name: `${displayProvider} User`,
      email: `${provider}.${now.getTime()}@example.com`,
    });
  }, [persist]);

  const loginCustom = useCallback((name: string, email: string) => {
    persist({
      provider: 'custom',
      name,
      email,
    });
  }, [persist]);

  const logout = useCallback(() => {
    persist(null);
  }, [persist]);

  return useMemo(() => ({ user, loginWithProvider, loginCustom, logout }), [user, loginWithProvider, loginCustom, logout]);
}