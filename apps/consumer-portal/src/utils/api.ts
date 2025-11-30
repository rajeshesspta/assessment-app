import type { TenantSession } from '../hooks/useTenantSession';

export interface AssessmentAnalytics {
  assessmentId: string;
  assessmentTitle?: string;
  attempts: number;
  averageScore: number | null;
}

export interface AttemptResponse {
  id: string;
  assessmentId: string;
  userId: string;
  status: 'in_progress' | 'submitted' | 'scored';
  score?: number;
  maxScore?: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiError {
  error: string;
  issues?: { message: string }[];
}

function normalizeBaseUrl(url: string): string {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : (payload as ApiError)?.error ?? 'Unknown error';
    throw new Error(message);
  }
  return payload as T;
}

export function createApiClient(session: TenantSession) {
  const baseUrl = normalizeBaseUrl(session.apiBaseUrl || '/api');

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-actor-roles': session.actorRoles.join(',') || 'LEARNER',
      ...init?.headers as Record<string, string> | undefined,
    };
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
    return parseResponse<T>(response);
  }

  return {
    async fetchAssessmentAnalytics(assessmentId: string): Promise<AssessmentAnalytics> {
      return request<AssessmentAnalytics>(`/analytics/assessments/${assessmentId}`);
    },
    async startAttempt(assessmentId: string): Promise<AttemptResponse> {
      return request<AttemptResponse>('/attempts', {
        method: 'POST',
        body: JSON.stringify({ assessmentId, userId: session.userId }),
      });
    },
    async fetchAttempt(attemptId: string): Promise<AttemptResponse> {
      return request<AttemptResponse>(`/attempts/${attemptId}`);
    },
  };
}
