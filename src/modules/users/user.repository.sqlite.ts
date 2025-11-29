import type { User } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';
import type { UserRepository } from './user.repository.js';

interface UserRow {
  id: string;
  tenant_id: string;
  role: string;
  email: string;
  display_name: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row?: UserRow): User | undefined {
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    role: row.role as User['role'],
    email: row.email,
    displayName: row.display_name ?? undefined,
    status: row.status as User['status'],
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSQLiteUserRepository(client: SQLiteTenantClient): UserRepository {
  return {
    save(user) {
      const db = client.getConnection(user.tenantId);
      db.prepare(`
        INSERT INTO users (id, tenant_id, role, email, display_name, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          role = excluded.role,
          email = excluded.email,
          display_name = excluded.display_name,
          status = excluded.status,
          created_by = excluded.created_by,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        user.id,
        user.tenantId,
        user.role,
        user.email,
        user.displayName ?? null,
        user.status,
        user.createdBy ?? null,
        user.createdAt,
        user.updatedAt,
      );
      return user;
    },
    getById(tenantId, id) {
      const db = client.getConnection(tenantId);
      const row = db
        .prepare('SELECT * FROM users WHERE tenant_id = ? AND id = ?')
        .get(tenantId, id) as UserRow | undefined;
      return mapRow(row);
    },
    getByEmail(tenantId, email) {
      const db = client.getConnection(tenantId);
      const row = db
        .prepare('SELECT * FROM users WHERE tenant_id = ? AND LOWER(email) = LOWER(?) LIMIT 1')
        .get(tenantId, email) as UserRow | undefined;
      return mapRow(row);
    },
    listByRole(tenantId, role) {
      const db = client.getConnection(tenantId);
      const rows = role
        ? (db
            .prepare('SELECT * FROM users WHERE tenant_id = ? AND role = ? ORDER BY created_at')
            .all(tenantId, role) as UserRow[])
        : (db
            .prepare('SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at')
            .all(tenantId) as UserRow[]);
      return rows.map(mapRow).filter((user): user is User => Boolean(user));
    },
  };
}
