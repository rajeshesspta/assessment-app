import type { Item } from '../../common/types.js';

export interface ItemRepository {
  save(item: Item): Item;
  getById(tenantId: string, id: string): Item | undefined;
  list(tenantId: string, options?: { search?: string; kind?: Item['kind']; limit?: number; offset?: number }): Item[];
}

export { createInMemoryItemRepository } from './item.repository.memory.js';
export { createSQLiteItemRepository } from './item.repository.sqlite.js';
