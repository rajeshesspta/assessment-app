import { Assessment } from '../../common/types.js';

export interface AssessmentRepository {
  save(assessment: Assessment): Assessment;
  get(id: string): Assessment | undefined;
}

export function createInMemoryAssessmentRepository(): AssessmentRepository {
  const store = new Map<string, Assessment>();
  return {
    save(assessment) {
      store.set(assessment.id, assessment);
      return assessment;
    },
    get(id) {
      return store.get(id);
    },
  };
}
