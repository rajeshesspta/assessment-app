import type { ItemRepository } from './item.repository.js';
import type { Item } from '../../common/types.js';

export function createInMemoryItemRepository(): ItemRepository {
  const store = new Map<string, Item>();
  const keyOf = (tenantId: string, id: string) => `${tenantId}::${id}`;
  return {
    save(item) {
      store.set(keyOf(item.tenantId, item.id), item);
      return item;
    },
    getById(tenantId, id) {
      return store.get(keyOf(tenantId, id));
    },
  };
}
