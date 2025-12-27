import { useCallback, useMemo, useState } from 'react';

export interface TenantSession {
  apiBaseUrl: string;
  actorRoles: string[];
  userId: string;
  tenantId: string;
}

const STORAGE_KEY = 'consumer-portal::session';

type PersistedSession = TenantSession;

function readFromStorage(): PersistedSession | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed.apiBaseUrl) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function useTenantSession() {
  const [session, setSession] = useState<PersistedSession | null>(() => readFromStorage());

  const saveSession = useCallback((next: TenantSession) => {
    setSession(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const derived = useMemo(() => session, [session]);

  return { session: derived, saveSession, clearSession } as const;
}
