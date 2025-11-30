import { useMemo } from 'react';
import type { TenantSession } from './useTenantSession';
import type { AttemptResponse } from '../utils/api';
import { createApiClient, type AssessmentAnalytics } from '../utils/api';

export interface DashboardState {
  assessments: AssessmentAnalytics[];
  attempts: AttemptResponse[];
}

export function useApiClient(session: TenantSession | null) {
  return useMemo(() => {
    if (!session) {
      return null;
    }
    return createApiClient(session);
  }, [session]);
}
