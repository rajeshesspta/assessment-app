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
    list(tenantId, options = {}) {
      const search = options.search?.toLowerCase();
      const kind = options.kind;
      const limit = options.limit ?? 10;
      const offset = options.offset ?? 0;
      const items: Item[] = [];
      for (const item of store.values()) {
        if (item.tenantId !== tenantId) continue;
        if (kind && item.kind !== kind) continue;
        if (search && !item.prompt.toLowerCase().includes(search)) continue;
        items.push(item);
      }
      return items
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(offset, offset + Math.max(0, limit));
    },
  };
}
