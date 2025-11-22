import { Item } from '../../common/types.js';

class ItemRepository {
  private store = new Map<string, Item>();

  save(item: Item) { this.store.set(item.id, item); return item; }
  get(id: string) { return this.store.get(id); }
}

export const itemRepository = new ItemRepository();
