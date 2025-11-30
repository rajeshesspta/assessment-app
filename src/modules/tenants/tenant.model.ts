import { v4 as uuid } from 'uuid';
import crypto from 'node:crypto';
import type { Tenant } from '../../common/types.js';

export interface TenantInput {
  id?: string;
  name: string;
  slug?: string;
  contactEmail: string;
  apiKey?: string;
  rateLimit?: Partial<Tenant['rateLimit']>;
  persistence?: Partial<Tenant['persistence']>;
  metadata?: Tenant['metadata'];
  status?: Tenant['status'];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function generateApiKey(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function createTenant(input: TenantInput): Tenant {
  const now = new Date().toISOString();
  const id = input.id ?? uuid();
  const slug = (input.slug ?? slugify(input.name)) || id;
  return {
    id,
    name: input.name,
    slug,
    status: input.status ?? 'active',
    contactEmail: input.contactEmail,
    apiKey: input.apiKey ?? generateApiKey(),
    rateLimit: {
      requestsPerMinute: input.rateLimit?.requestsPerMinute ?? 600,
      burst: input.rateLimit?.burst ?? 120,
    },
    persistence: {
      provider: input.persistence?.provider ?? 'sqlite',
    },
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTenant(existing: Tenant, patch: Partial<Omit<TenantInput, 'id'>>): Tenant {
  const next = { ...existing } as Tenant;
  if (patch.name) {
    next.name = patch.name;
  }
  if (patch.slug) {
    next.slug = patch.slug;
  }
  if (patch.status) {
    next.status = patch.status;
  }
  if (patch.contactEmail !== undefined) {
    next.contactEmail = patch.contactEmail;
  }
  if (patch.apiKey) {
    next.apiKey = patch.apiKey;
  }
  if (patch.rateLimit) {
    next.rateLimit = {
      requestsPerMinute: patch.rateLimit.requestsPerMinute ?? next.rateLimit.requestsPerMinute,
      burst: patch.rateLimit.burst ?? next.rateLimit.burst,
    };
  }
  if (patch.persistence?.provider) {
    next.persistence = { provider: patch.persistence.provider };
  }
  if (patch.metadata !== undefined) {
    next.metadata = patch.metadata;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}
