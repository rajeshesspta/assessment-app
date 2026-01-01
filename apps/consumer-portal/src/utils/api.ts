import type { TenantSession } from '../hooks/useTenantSession';

export interface AssessmentAnalytics {
  assessmentId: string;
  assessmentTitle?: string;
  attempts: number;
  averageScore: number | null;
}

export interface AttemptResponseItem {
  itemId: string;
  answerIndexes?: number[];
  textAnswers?: string[];
  matchingAnswers?: { promptId: string; targetId: string }[];
  orderingAnswer?: string[];
  essayAnswer?: string;
  numericAnswer?: { value: number; unit?: string };
  hotspotAnswers?: { x: number; y: number }[];
  dragDropAnswers?: { tokenId: string; dropZoneId: string; position?: number }[];
  scenarioAnswer?: { repositoryUrl?: string; artifactUrl?: string; files?: { path: string; url?: string }[] };
}

export interface AttemptResponse {
  id: string;
  assessmentId: string;
  userId: string;
  status: 'in_progress' | 'submitted' | 'scored';
  score?: number;
  maxScore?: number;
  items?: Item[];
  responses?: AttemptResponseItem[];
  itemVersionIds?: string[];
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
  categories?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
  choices?: { text: string }[];
  answerMode?: 'single' | 'multiple';
  correctIndexes?: number[];
  blanks?: { id: string }[];
  prompts?: { id: string; text: string }[];
  targets?: { id: string; text: string }[];
  options?: { id: string; text: string }[];
  image?: { url: string; width: number; height: number; alt?: string };
  tokens?: { id: string; label: string }[];
  zones?: { id: string; label?: string }[];
  brief?: string;
}

export interface Assessment {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  collectionId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  itemIds?: string[];
  allowedAttempts: number;
  timeLimitMinutes?: number;
  revealDetailsAfterCompletion?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
  status: string;
  createdAt: string;
}

export interface Cohort {
  id: string;
  name: string;
  learnerIds: string[];
  assessmentIds: string[];
  assignments?: {
    assessmentId: string;
    allowedAttempts?: number;
    availableFrom?: string;
    dueDate?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotSummaryPerItem {
  originalItemId: string;
  count: number;
  newestSnapshotAt?: string;
  newestSnapshotId?: string;
  oldestSnapshotAt?: string;
  itemTitle?: string;
  itemKind?: ItemKind;
}

export interface SnapshotSummary {
  totalSnapshots: number;
  uniqueItems: number;
  newestSnapshotAt?: string;
  oldestSnapshotAt?: string;
  assessmentsWithSnapshots: number;
  assessmentsMissingSnapshots: number;
  perItem: SnapshotSummaryPerItem[];
}

export interface SnapshotEntry {
  id: string;
  originalItemId: string;
  createdAt: string;
  createdBy?: string;
  itemVersion?: string;
}

export interface SnapshotDetails {
  originalItemId: string;
  totalSnapshots: number;
  snapshots: SnapshotEntry[];
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
      'x-actor-roles': session.actorRoles.join(',') || 'LEARNER',
      'x-actor-id': session.userId,
      'x-tenant-id': session.tenantId,
      ...init?.headers as Record<string, string> | undefined,
    };
    // Only set content-type for requests with a body
    if (init?.body) {
      headers['Content-Type'] = 'application/json';
    }
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
    async fetchAttemptItems(attemptId: string): Promise<Item[]> {
      return request<Item[]>(`/attempts/${attemptId}/items`);
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
    async updateAssessment(id: string, assessment: Partial<Assessment>): Promise<Assessment> {
      return request<Assessment>(`/assessments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(assessment),
      });
    },
    async fetchAssessment(id: string): Promise<Assessment> {
      return request<Assessment>(`/assessments/${id}`);
    },
    async fetchAssessmentSnapshots(assessmentId: string): Promise<any[]> {
      return request<any[]>(`/snapshots/assessment/${assessmentId}`);
    },
    async resnapshotAssessment(assessmentId: string): Promise<{ snapshotIds: string[] }> {
      return request<{ snapshotIds: string[] }>(`/snapshots/assessment/${assessmentId}/resnapshot`, {
        method: 'POST',
      });
    },
    async fetchSnapshotSummary(): Promise<SnapshotSummary> {
      return request<SnapshotSummary>('/snapshots/reports/summary');
    },
    async fetchSnapshotsByOriginalItem(itemId: string): Promise<SnapshotDetails> {
      return request<SnapshotDetails>(`/snapshots/reports/original/${itemId}`);
    },
    async saveAttemptResponses(attemptId: string, responses: any[]): Promise<AttemptResponse> {
      return request<AttemptResponse>(`/attempts/${attemptId}/responses`, {
        method: 'PATCH',
        body: JSON.stringify({ responses }),
      });
    },
    async submitAttempt(attemptId: string): Promise<AttemptResponse> {
      return request<AttemptResponse>(`/attempts/${attemptId}/submit`, {
        method: 'POST',
      });
    },
    async fetchAttempts(): Promise<AttemptResponse[]> {
      return request<AttemptResponse[]>(`/attempts/user/${session.userId}`);
    },
    async fetchCohorts(): Promise<Cohort[]> {
      return request<Cohort[]>('/cohorts');
    },
    async createCohort(cohort: Partial<Cohort>): Promise<Cohort> {
      return request<Cohort>('/cohorts', {
        method: 'POST',
        body: JSON.stringify(cohort),
      });
    },
    async updateCohort(id: string, cohort: Partial<Cohort>): Promise<Cohort> {
      return request<Cohort>(`/cohorts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(cohort),
      });
    },
    async deleteCohort(id: string): Promise<void> {
      return request<void>(`/cohorts/${id}`, {
        method: 'DELETE',
      });
    },
    async fetchLearnerCohorts(userId: string): Promise<Cohort[]> {
      return request<Cohort[]>(`/cohorts/learner/${userId}`);
    },
    async fetchUserAttempts(userId: string): Promise<AttemptResponse[]> {
      return request<AttemptResponse[]>(`/attempts/user/${userId}`);
    },
    async fetchUsers(): Promise<User[]> {
      return request<User[]>('/users');
    },
    async createUser(user: Partial<User>): Promise<User> {
      return request<User>('/users', {
        method: 'POST',
        body: JSON.stringify(user),
      });
    },
    async updateUser(id: string, user: Partial<User>): Promise<User> {
      return request<User>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(user),
      });
    },
    async deleteUser(id: string): Promise<void> {
      return request<void>(`/users/${id}`, {
        method: 'DELETE',
      });
    },
    async fetchUserRoles(): Promise<{ roles: string[] }> {
      return request<{ roles: string[] }>('/users/roles');
    },
    async fetchTaxonomyConfig(): Promise<any> {
      return request<any>('/config/taxonomy');
    },
    async updateTaxonomyConfig(config: any): Promise<any> {
      return request<any>('/config/taxonomy', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
    },
    async assignToUser(userId: string, assignment: { assessmentId: string; allowedAttempts?: number; availableFrom?: string; dueDate?: string }): Promise<any> {
      return request(`/cohorts/assignments/users/${userId}`, {
        method: 'POST',
        body: JSON.stringify({
          assignments: [{
            assessmentId: assignment.assessmentId,
            allowedAttempts: assignment.allowedAttempts,
            availableFrom: assignment.availableFrom,
            dueDate: assignment.dueDate,
          }]
        }),
      });
    },
    async assignAssessmentToCohort(cohortId: string, assessmentId: string, options?: { allowedAttempts?: number; availableFrom?: string; dueDate?: string }): Promise<Cohort> {
      return request<Cohort>(`/cohorts/${cohortId}/assessments`, {
        method: 'POST',
        body: JSON.stringify({ 
          assignments: [{ assessmentId, ...options }] 
        }),
      });
    },
  };
}
