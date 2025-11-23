import type { AppConfig } from '../config/index.js';
import {
  createInMemoryItemRepository,
  type ItemRepository,
} from '../modules/items/item.repository.js';
import {
  createInMemoryAssessmentRepository,
  type AssessmentRepository,
} from '../modules/assessments/assessment.repository.js';
import {
  createInMemoryAttemptRepository,
  type AttemptRepository,
} from '../modules/attempts/attempt.repository.js';

export interface RepositoryBundle {
  item: ItemRepository;
  assessment: AssessmentRepository;
  attempt: AttemptRepository;
}

export function createInMemoryRepositoryBundle(): RepositoryBundle {
  return {
    item: createInMemoryItemRepository(),
    assessment: createInMemoryAssessmentRepository(),
    attempt: createInMemoryAttemptRepository(),
  };
}

export function createCosmosRepositoryBundle(_config: AppConfig): RepositoryBundle {
  throw new Error('Cosmos repository bundle not implemented yet');
}

export function createRepositoryBundleFromConfig(config: AppConfig): RepositoryBundle {
  if (config.persistence.provider === 'cosmos') {
    return createCosmosRepositoryBundle(config);
  }
  return createInMemoryRepositoryBundle();
}
