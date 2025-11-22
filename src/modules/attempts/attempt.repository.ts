import { Attempt } from '../../common/types.js';

class AttemptRepository {
  private store = new Map<string, Attempt>();
  save(a: Attempt) { this.store.set(a.id, a); return a; }
  get(id: string) { return this.store.get(id); }
}
export const attemptRepository = new AttemptRepository();
