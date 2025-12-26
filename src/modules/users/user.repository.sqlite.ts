import type { User } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';
import type { UserRepository } from './user.repository.js';

interface UserRow {
  id: string;
  tenant_id: string;
  role: string;
  roles_json: string | null;
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
  let parsedRoles: User['roles'] = [];
  if (row.roles_json) {
    try {
      const value = JSON.parse(row.roles_json);
      if (Array.isArray(value)) {
        parsedRoles = value.filter((role): role is User['roles'][number] => typeof role === 'string');
      }
    } catch {
      parsedRoles = [];
    }
  }
  if (parsedRoles.length === 0 && row.role) {
    parsedRoles = [row.role as User['roles'][number]];
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    roles: parsedRoles,
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
        INSERT INTO users (id, tenant_id, role, roles_json, email, display_name, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          role = excluded.role,
          roles_json = excluded.roles_json,
          email = excluded.email,
          display_name = excluded.display_name,
          status = excluded.status,
          created_by = excluded.created_by,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `).run(
        user.id,
        user.tenantId,
        user.roles[0],
        JSON.stringify(user.roles),
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
      const rows = db
        .prepare('SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at')
        .all(tenantId) as UserRow[];
      const users = rows.map(mapRow).filter((user): user is User => Boolean(user));
      return role ? users.filter(user => user.roles.includes(role)) : users;
    },
    delete(tenantId, id) {
      const db = client.getConnection(tenantId);
      db.prepare('DELETE FROM users WHERE tenant_id = ? AND id = ?').run(tenantId, id);
    },
  };
}
