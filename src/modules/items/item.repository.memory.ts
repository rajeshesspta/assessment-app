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
        if (options.kind && item.kind !== options.kind) continue;
        if (options.search && !item.prompt.toLowerCase().includes(options.search)) continue;
        if (options.categories && options.categories.length > 0) {
          if (!item.categories || !options.categories.some(cat => item.categories?.includes(cat))) continue;
        }
        if (options.tags && options.tags.length > 0) {
          if (!item.tags || !options.tags.some(tag => item.tags?.includes(tag))) continue;
        }
        if (options.metadata) {
          let match = true;
          for (const [key, value] of Object.entries(options.metadata)) {
            if (item.metadata?.[key] !== value) {
              match = false;
              break;
            }
          }
          if (!match) continue;
        }
        items.push(item);
      }
      return items
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(offset, offset + Math.max(0, limit));
    },
  };
}
