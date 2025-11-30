import { v4 as uuid } from 'uuid';
import type { Cohort } from '../../common/types.js';

export interface CohortInput {
  id?: string;
  tenantId: string;
  name: string;
  description?: string;
  learnerIds: string[];
  assessmentIds?: string[];
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Cohort name cannot be empty');
  }
  return trimmed;
}

function dedupeIds(ids: string[], requireNonEmpty = false): string[] {
  const deduped: string[] = [];
  for (const raw of ids) {
    const candidate = raw.trim();
    if (!candidate) {
      continue;
    }
    if (!deduped.includes(candidate)) {
      deduped.push(candidate);
    }
  }
  if (requireNonEmpty && deduped.length === 0) {
    throw new Error('Cohort must include at least one learner');
  }
  return deduped;
}

function normalizeDescription(description?: string): string | undefined {
  if (description === undefined) {
    return undefined;
  }
  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createCohort(input: CohortInput): Cohort {
  const now = new Date().toISOString();
  return {
    id: input.id ?? uuid(),
    tenantId: input.tenantId,
    name: requireName(input.name),
    description: normalizeDescription(input.description),
    learnerIds: dedupeIds(input.learnerIds, true),
    assessmentIds: dedupeIds(input.assessmentIds ?? []),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateCohort(existing: Cohort, patch: Partial<Omit<CohortInput, 'tenantId'>>): Cohort {
  const next: Cohort = { ...existing };
  if (patch.name !== undefined) {
    next.name = requireName(patch.name);
  }
  if (patch.description !== undefined) {
    next.description = normalizeDescription(patch.description);
  }
  if (patch.learnerIds) {
    next.learnerIds = dedupeIds(patch.learnerIds, true);
  }
  if (patch.assessmentIds) {
    next.assessmentIds = dedupeIds(patch.assessmentIds);
  }
  next.updatedAt = new Date().toISOString();
  return next;
}
