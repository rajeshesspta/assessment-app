import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthError, TenantError } from '../../common/errors.js';

const API_KEY = process.env.API_KEY || 'dev-key';

export async function registerAuth(req: FastifyRequest, reply: FastifyReply) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    reply.code(401);
    throw new AuthError('Invalid API key');
  }
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId || typeof tenantId !== 'string') {
    reply.code(400);
    throw new TenantError('Missing x-tenant-id header');
  }
  (req as any).tenantId = tenantId;
}
