import type { Cohort } from '../../common/types.js';
import type { CohortRepository } from './cohort.repository.js';

export function createInMemoryCohortRepository(): CohortRepository {
  const store = new Map<string, Cohort>();
  const keyOf = (tenantId: string, id: string) => `${tenantId}::${id}`;
  return {
    save(cohort) {
      store.set(keyOf(cohort.tenantId, cohort.id), cohort);
      return cohort;
    },
    getById(tenantId, id) {
      return store.get(keyOf(tenantId, id));
    },
    list(tenantId) {
      const results: Cohort[] = [];
      for (const cohort of store.values()) {
        if (cohort.tenantId === tenantId) {
          results.push(cohort);
        }
      }
      return results;
    },
    listByLearner(tenantId, learnerId) {
      return Array.from(store.values()).filter(
        cohort => cohort.tenantId === tenantId && cohort.learnerIds.includes(learnerId),
      );
    },
  };
}
