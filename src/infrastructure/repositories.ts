import type { AppConfig } from '../config/index.js';
import {
  createInMemoryItemRepository,
  createSQLiteItemRepository,
  type ItemRepository,
} from '../modules/items/item.repository.js';
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
import { createSQLiteTenantClient } from './sqlite/client.js';

export interface RepositoryBundle {
  item: ItemRepository;
  assessment: AssessmentRepository;
  attempt: AttemptRepository;
  user: UserRepository;
  dispose?: () => void | Promise<void>;
}

export function createInMemoryRepositoryBundle(): RepositoryBundle {
  return {
    item: createInMemoryItemRepository(),
    assessment: createInMemoryAssessmentRepository(),
    attempt: createInMemoryAttemptRepository(),
    user: createInMemoryUserRepository(),
    dispose: () => {},
  };
}

export function createSQLiteRepositoryBundle(config: AppConfig): RepositoryBundle {
  const client = createSQLiteTenantClient(config.persistence.sqlite);
  return {
    item: createSQLiteItemRepository(client),
    assessment: createSQLiteAssessmentRepository(client),
    attempt: createSQLiteAttemptRepository(client),
    user: createSQLiteUserRepository(client),
    dispose: () => client.closeAll(),
  };
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
