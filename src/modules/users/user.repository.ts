import type { User, UserRole } from '../../common/types.js';

export interface UserRepository {
  save(user: User): User;
  getById(tenantId: string, id: string): User | undefined;
  getByEmail(tenantId: string, email: string): User | undefined;
  listByRole(tenantId: string, role?: UserRole): User[];
}

export { createInMemoryUserRepository } from './user.repository.memory.js';
export { createSQLiteUserRepository } from './user.repository.sqlite.js';
