import { v4 as uuid } from 'uuid';
import type { User, UserRole, UserStatus } from '../../common/types.js';

export interface UserInput {
  id?: string;
  tenantId: string;
  role: UserRole;
  email: string;
  displayName?: string;
  status?: UserStatus;
  createdBy?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUser(input: UserInput): User {
  const now = new Date().toISOString();
  return {
    id: input.id ?? uuid(),
    tenantId: input.tenantId,
    role: input.role,
    email: normalizeEmail(input.email),
    displayName: input.displayName?.trim() || undefined,
    status: input.status ?? 'invited',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateUser(existing: User, patch: Partial<Omit<UserInput, 'tenantId'>>): User {
  const next: User = { ...existing };
  if (patch.role) {
    next.role = patch.role;
  }
  if (patch.email) {
    next.email = normalizeEmail(patch.email);
  }
  if (patch.displayName !== undefined) {
    const trimmed = patch.displayName?.trim();
    next.displayName = trimmed || undefined;
  }
  if (patch.status) {
    next.status = patch.status;
  }
  if (patch.createdBy !== undefined) {
    next.createdBy = patch.createdBy;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}
