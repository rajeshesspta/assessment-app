import type { Tenant } from '../../common/types.js';
import type { TenantRepository } from './tenant.repository.js';

export function createInMemoryTenantRepository(): TenantRepository {
  const byId = new Map<string, Tenant>();
  const slugIndex = new Map<string, string>();

  function assertSlugAvailable(slug: string, id: string) {
    const existingId = slugIndex.get(slug);
    if (existingId && existingId !== id) {
      throw new Error(`Tenant slug "${slug}" already in use`);
    }
  }

  return {
    list() {
      return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    getById(id) {
      return byId.get(id);
    },
    getBySlug(slug) {
      const id = slugIndex.get(slug);
      return id ? byId.get(id) : undefined;
    },
    save(tenant) {
      assertSlugAvailable(tenant.slug, tenant.id);
      byId.set(tenant.id, tenant);
      slugIndex.set(tenant.slug, tenant.id);
      return tenant;
    },
    delete(id) {
      const existing = byId.get(id);
      if (existing) {
        slugIndex.delete(existing.slug);
      }
      byId.delete(id);
    },
  };
}
