import type { AppConfig } from '../config/index.js';
import {
  createInMemoryItemRepository,
  createSQLiteItemRepository,
  type ItemRepository,
} from '../modules/items/item.repository.js';
import {
  createInMemoryItemSnapshotRepository,
  createSQLiteItemSnapshotRepository,
  type ItemSnapshotRepository,
} from '../modules/items/item.snapshot.repository.js';
import {
  createInMemoryAssessmentRepository,
  createSQLiteAssessmentRepository,
  type AssessmentRepository,
} from '../modules/assessments/assessment.repository.js';
import {
  createInMemoryAttemptRepository,
  createSQLiteAttemptRepository,
  type AttemptRepository,
} from '../modules/attempts/attempt.repository.js';
import {
  createInMemoryUserRepository,
  createSQLiteUserRepository,
  type UserRepository,
} from '../modules/users/user.repository.js';
import {
  createInMemoryCohortRepository,
  createSQLiteCohortRepository,
  type CohortRepository,
} from '../modules/cohorts/cohort.repository.js';
import {
  createInMemoryTaxonomyRepository,
  createSQLiteTaxonomyRepository,
  type TaxonomyRepository,
} from '../modules/taxonomy-config/taxonomy.repository.js';
import { TENANT_DIRECTORY_ID } from '../modules/tenants/tenant.repository.sqlite.js';
import { createSQLiteTenantClient } from './sqlite/client.js';
import type { SQLiteTenantClient } from './sqlite/client.js';
import { seedDefaultTenantData } from './sqlite/seeds.js';

export interface RepositoryBundle {
  item: ItemRepository;
  assessment: AssessmentRepository;
  attempt: AttemptRepository;
  user: UserRepository;
  cohort: CohortRepository;
  taxonomy: TaxonomyRepository;
  snapshot: ItemSnapshotRepository;
  dispose?: () => void | Promise<void>;
}

export function createInMemoryRepositoryBundle(): RepositoryBundle {
  return {
    item: createInMemoryItemRepository(),
    assessment: createInMemoryAssessmentRepository(),
    attempt: createInMemoryAttemptRepository(),
    user: createInMemoryUserRepository(),
    cohort: createInMemoryCohortRepository(),
    taxonomy: createInMemoryTaxonomyRepository(),
    snapshot: createInMemoryItemSnapshotRepository(),
    dispose: () => {},
  };
}

export function createSQLiteRepositoryBundle(config: AppConfig): RepositoryBundle {
  const client = createSQLiteTenantClient(config.persistence.sqlite);
  seedDefaultTenantsForConfig(config, client);
  return {
    item: createSQLiteItemRepository(client),
    assessment: createSQLiteAssessmentRepository(client),
    attempt: createSQLiteAttemptRepository(client),
    user: createSQLiteUserRepository(client),
    cohort: createSQLiteCohortRepository(client),
    taxonomy: createSQLiteTaxonomyRepository(client),
    snapshot: createSQLiteItemSnapshotRepository(client),
    dispose: () => client.closeAll(),
  };
}

function seedDefaultTenantsForConfig(config: AppConfig, client: SQLiteTenantClient): void {
  if (!config.persistence.sqlite.seedDefaultTenant) {
    return;
  }
  const seeded = new Set<string>();
  for (const { tenantId } of config.auth.seedKeys) {
    if (!tenantId || seeded.has(tenantId) || tenantId === config.auth.superAdminTenantId || tenantId === TENANT_DIRECTORY_ID) {
      continue;
    }
    seeded.add(tenantId);
    const db = client.getConnection(tenantId);
    seedDefaultTenantData(db, tenantId);
  }
}

export function createCosmosRepositoryBundle(_config: AppConfig): RepositoryBundle {
  throw new Error('Cosmos repository bundle not implemented yet');
}

export function createRepositoryBundleFromConfig(config: AppConfig): RepositoryBundle {
  switch (config.persistence.provider) {
    case 'cosmos':
      return createCosmosRepositoryBundle(config);
    case 'memory':
      return createInMemoryRepositoryBundle();
    case 'sqlite':
    default:
      return createSQLiteRepositoryBundle(config);
  }
}
