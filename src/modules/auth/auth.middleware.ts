import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthError, TenantError } from '../../common/errors.js';
import { apiKeyStore } from './api-key.store.js';
import { loadConfig } from '../../config/index.js';

const { auth: { superAdminTenantId } } = loadConfig();

export async function registerAuth(req: FastifyRequest, reply: FastifyReply) {
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
  (req as any).tenantId = tenantId;
  (req as any).actorTenantId = record.tenantId;
  (req as any).isSuperAdmin = isSuperAdmin;
}
