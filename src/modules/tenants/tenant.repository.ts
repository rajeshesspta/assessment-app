import type { Tenant } from '../../common/types.js';

export interface TenantRepository {
  list(): Tenant[];
  getById(id: string): Tenant | undefined;
  getBySlug(slug: string): Tenant | undefined;
  save(tenant: Tenant): Tenant;
  delete(id: string): void;
  dispose?: () => void | Promise<void>;
}

export { createInMemoryTenantRepository } from './tenant.repository.memory.js';
export { createSQLiteTenantRepository } from './tenant.repository.sqlite.js';
