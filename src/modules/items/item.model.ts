import type { Item } from '../../common/types.js';

export function createItem<TItem extends Item>(data: Omit<TItem, 'id' | 'createdAt' | 'updatedAt'> & { id: string }): TItem {
  const now = new Date().toISOString();
  return { ...data, createdAt: now, updatedAt: now } as TItem;
}
