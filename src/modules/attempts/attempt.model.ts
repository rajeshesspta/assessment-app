import { Attempt } from '../../common/types.js';
export function createAttempt(data: Omit<Attempt, 'createdAt' | 'updatedAt' | 'status' | 'responses'>): Attempt {
  const now = new Date().toISOString();
  return { ...data, createdAt: now, updatedAt: now, status: 'in_progress', responses: [] };
}
