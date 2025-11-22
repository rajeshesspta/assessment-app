import { Assessment } from '../../common/types.js';

class AssessmentRepository {
  private store = new Map<string, Assessment>();
  save(a: Assessment) { this.store.set(a.id, a); return a; }
  get(id: string) { return this.store.get(id); }
}
export const assessmentRepository = new AssessmentRepository();
