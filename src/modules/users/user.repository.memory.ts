import type { User } from '../../common/types.js';
import type { UserRepository } from './user.repository.js';

function keyOf(tenantId: string, id: string): string {
  return `${tenantId}::${id}`;
}

function emailKeyOf(tenantId: string, email: string): string {
  return `${tenantId}::${email.trim().toLowerCase()}`;
}

export function createInMemoryUserRepository(): UserRepository {
  const store = new Map<string, User>();
  const emailIndex = new Map<string, string>();

  return {
    save(user) {
      const key = keyOf(user.tenantId, user.id);
      const previous = store.get(key);
      if (previous && previous.email !== user.email) {
        emailIndex.delete(emailKeyOf(previous.tenantId, previous.email));
      }
      store.set(key, user);
      emailIndex.set(emailKeyOf(user.tenantId, user.email), key);
      return user;
    },
    getById(tenantId, id) {
      return store.get(keyOf(tenantId, id));
    },
    getByEmail(tenantId, email) {
      const key = emailIndex.get(emailKeyOf(tenantId, email));
      return key ? store.get(key) : undefined;
    },
    listByRole(tenantId, role) {
      return Array.from(store.values())
        .filter(user => user.tenantId === tenantId && (!role || user.roles.includes(role)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    delete(tenantId, id) {
      const key = keyOf(tenantId, id);
      const user = store.get(key);
      if (user) {
        emailIndex.delete(emailKeyOf(tenantId, user.email));
        store.delete(key);
      }
    },
  };
}
