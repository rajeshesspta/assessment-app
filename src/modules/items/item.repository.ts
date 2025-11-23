import { Item } from '../../common/types.js';

export interface ItemRepository {
  save(item: Item): Item;
  get(id: string): Item | undefined;
}

export function createInMemoryItemRepository(): ItemRepository {
  const store = new Map<string, Item>();
  return {
    save(item) {
      store.set(item.id, item);
      return item;
    },
    get(id) {
      return store.get(id);
    },
  };
}
