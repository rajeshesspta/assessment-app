import type { Cohort } from '../../common/types.js';

export interface CohortRepository {
  save(cohort: Cohort): Cohort;
  getById(tenantId: string, id: string): Cohort | undefined;
  list(tenantId: string): Cohort[];
  listByLearner(tenantId: string, learnerId: string): Cohort[];
}

export { createInMemoryCohortRepository } from './cohort.repository.memory.js';
export { createSQLiteCohortRepository } from './cohort.repository.sqlite.js';
