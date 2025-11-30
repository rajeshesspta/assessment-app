import { Assessment } from '../../common/types.js';
export function createAssessment(
  data: Omit<Assessment, 'createdAt' | 'updatedAt' | 'allowedAttempts'> & { allowedAttempts?: number },
): Assessment {
  const now = new Date().toISOString();
  const allowedAttempts = typeof data.allowedAttempts === 'number' && Number.isFinite(data.allowedAttempts)
    ? Math.max(1, Math.floor(data.allowedAttempts))
    : 1;
  return { ...data, allowedAttempts, createdAt: now, updatedAt: now };
}
