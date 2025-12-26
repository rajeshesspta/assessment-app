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

export type ItemKind = 'MCQ' | 'TRUE_FALSE' | 'FILL_IN_THE_BLANK' | 'MATCHING' | 'ORDERING' | 'SHORT_ANSWER' | 'ESSAY' | 'NUMERIC_ENTRY' | 'HOTSPOT' | 'DRAG_AND_DROP' | 'SCENARIO_TASK';

export interface Item {
  id: string;
  kind: ItemKind;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  // Add other fields as needed for specific kinds
  choices?: { text: string }[];
  answerMode?: 'single' | 'multiple';
  correctIndexes?: number[];
  answerIsTrue?: boolean;
  prompts?: string[];
  targets?: string[];
  options?: string[];
  correctOrder?: number[];
  correctValue?: number;
  tolerance?: number;
  units?: string;
  sampleAnswer?: string;
  rubric?: {
    keywords?: string[];
    sections?: { section: string; points: number }[];
  };
  lengthExpectation?: {
    minWords?: number;
    maxWords?: number;
  };
  blanks?: { key: string; correctValue: string }[];
  imageUri?: string;
  polygons?: { id: string; points: { x: number; y: number }[] }[];
  tokens?: { id: string; text: string }[];
  zones?: { id: string; label: string; correctTokenIds: string[] }[];
  workspaceTemplate?: string;
}

export interface Assessment {
  id: string;
  title: string;
  description?: string;
  itemIds: string[];
  allowedAttempts: number;
  timeLimitMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Cohort {
  id: string;
  name: string;
  learnerIds: string[];
  assessmentIds: string[];
  assignments?: {
    assessmentId: string;
    allowedAttempts?: number;
  }[];
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
    async fetchItems(params?: { search?: string; kind?: ItemKind; limit?: number; offset?: number }): Promise<Item[]> {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.kind) query.set('kind', params.kind);
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.offset) query.set('offset', params.offset.toString());
      const queryString = query.toString();
      return request<Item[]>(`/items${queryString ? `?${queryString}` : ''}`);
    },
    async createItem(item: Partial<Item>): Promise<Item> {
      return request<Item>('/items', {
        method: 'POST',
        body: JSON.stringify(item),
      });
    },
    async updateItem(id: string, item: Partial<Item>): Promise<Item> {
      return request<Item>(`/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(item),
      });
    },
    async fetchAssessments(): Promise<Assessment[]> {
      return request<Assessment[]>('/assessments');
    },
    async createAssessment(assessment: Partial<Assessment>): Promise<Assessment> {
      return request<Assessment>('/assessments', {
        method: 'POST',
        body: JSON.stringify(assessment),
      });
    },
    async fetchAssessment(id: string): Promise<Assessment> {
      return request<Assessment>(`/assessments/${id}`);
    },
    async saveAttemptResponses(attemptId: string, responses: any[]): Promise<AttemptResponse> {
      return request<AttemptResponse>(`/attempts/${attemptId}/responses`, {
        method: 'PUT',
        body: JSON.stringify({ responses }),
      });
    },
    async submitAttempt(attemptId: string): Promise<AttemptResponse> {
      return request<AttemptResponse>(`/attempts/${attemptId}/submit`, {
        method: 'POST',
      });
    },
    async fetchCohorts(): Promise<Cohort[]> {
      return request<Cohort[]>('/cohorts');
    },
    async assignAssessmentToCohort(cohortId: string, assessmentId: string, options?: { allowedAttempts?: number }): Promise<Cohort> {
      return request<Cohort>(`/cohorts/${cohortId}/assessments`, {
        method: 'POST',
        body: JSON.stringify({ 
          assignments: [{ assessmentId, ...options }] 
        }),
      });
    },
  };
}
