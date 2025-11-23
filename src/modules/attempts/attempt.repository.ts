import { Attempt } from '../../common/types.js';

export interface AttemptRepository {
  save(attempt: Attempt): Attempt;
  get(id: string): Attempt | undefined;
  listByAssessment(assessmentId: string): Attempt[];
}

export function createInMemoryAttemptRepository(): AttemptRepository {
  const store = new Map<string, Attempt>();
  return {
    save(attempt) {
      store.set(attempt.id, attempt);
      return attempt;
    },
    get(id) {
      return store.get(id);
    },
    listByAssessment(assessmentId) {
      return Array.from(store.values()).filter(a => a.assessmentId === assessmentId);
    },
  };
}
