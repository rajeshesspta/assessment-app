import { Assessment } from '../../common/types.js';
export function createAssessment(data: Omit<Assessment, 'createdAt' | 'updatedAt'>): Assessment {
  const now = new Date().toISOString();
  return { ...data, createdAt: now, updatedAt: now };
}
