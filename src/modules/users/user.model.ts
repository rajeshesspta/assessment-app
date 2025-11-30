import { v4 as uuid } from 'uuid';
import type { User, UserRole, UserStatus } from '../../common/types.js';

export interface UserInput {
  id?: string;
  tenantId: string;
  roles: UserRole[];
  email: string;
  displayName?: string;
  status?: UserStatus;
  createdBy?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function ensureRoles(input?: UserRole[]): UserRole[] {
  const deduped: UserRole[] = [];
  for (const role of input ?? []) {
    if (!role) continue;
    if (!deduped.includes(role)) {
      deduped.push(role);
    }
  }
  if (deduped.length === 0) {
    throw new Error('User must have at least one role');
  }
  return deduped;
}

export function createUser(input: UserInput): User {
  const now = new Date().toISOString();
  const roles = ensureRoles(input.roles);
  return {
    id: input.id ?? uuid(),
    tenantId: input.tenantId,
    roles,
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
  if (patch.roles) {
    next.roles = ensureRoles(patch.roles);
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
