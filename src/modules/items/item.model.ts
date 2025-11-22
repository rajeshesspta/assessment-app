import { Item } from '../../common/types.js';
export function createItem(data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> & { id: string }): Item {
  const now = new Date().toISOString();
  return { ...data, createdAt: now, updatedAt: now };
}
