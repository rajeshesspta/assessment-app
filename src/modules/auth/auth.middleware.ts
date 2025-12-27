import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthError, TenantError } from '../../common/errors.js';
import { apiKeyStore } from './api-key.store.js';
import { loadConfig } from '../../config/index.js';
import { USER_ROLES, type UserRole } from '../../common/types.js';
import type { UserRepository } from '../users/user.repository.js';

const { auth: { superAdminTenantId } } = loadConfig();

function parseActorRoles(value: string | string[] | undefined): UserRole[] {
  if (!value) {
    return [];
  }
  const raw = Array.isArray(value) ? value : value.split(',');
  const normalized: UserRole[] = [];
  for (const entry of raw) {
    const candidate = entry.trim().toUpperCase();
    if (!candidate) {
      continue;
    }
    if (USER_ROLES.includes(candidate as UserRole) && !normalized.includes(candidate as UserRole)) {
      normalized.push(candidate as UserRole);
    }
  }
  return normalized;
}

export async function registerAuth(req: FastifyRequest, reply: FastifyReply, userRepository?: UserRepository) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    reply.code(401);
    throw new AuthError('Missing API key');
  }
  let record;
  try {
    record = await apiKeyStore.get(apiKey);
  } catch (err) {
    req.log.error({ err }, 'Failed to resolve API key');
    reply.code(503);
    throw new AuthError('Unable to validate API key');
  }
  if (!record) {
    reply.code(401);
    throw new AuthError('Invalid API key');
  }
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId || typeof tenantId !== 'string') {
    reply.code(400);
    throw new TenantError('Missing x-tenant-id header');
  }
  const isSuperAdmin = record.tenantId === superAdminTenantId;
  if (!isSuperAdmin && tenantId !== record.tenantId) {
    reply.code(403);
    throw new TenantError('Tenant mismatch for API key');
  }
  const actorRolesHeader = req.headers['x-actor-roles'];
  const actorRoles = parseActorRoles(actorRolesHeader);
  const actorId = req.headers['x-actor-id'];
  (req as any).tenantId = tenantId;
  (req as any).actorTenantId = record.tenantId;
  (req as any).isSuperAdmin = isSuperAdmin;
  (req as any).actorRoles = actorRoles.length > 0 ? actorRoles : [isSuperAdmin ? 'SUPER_ADMIN' : 'TENANT_ADMIN'];
  
  let userId = typeof actorId === 'string' ? actorId : undefined;
  
  // If userId looks like an email and we have a userRepository, try to resolve it to a UUID
  if (userId && userId.includes('@') && userRepository) {
    try {
      const user = userRepository.getByEmail(tenantId, userId);
      if (user) {
        userId = user.id;
      }
    } catch (err) {
      req.log.warn({ err, email: userId }, 'Failed to resolve user by email in auth middleware');
    }
  }
  
  (req as any).userId = userId;
}
