import type { FastifyInstance } from 'fastify';
import type { TenantRegistryRepository } from '../repositories/tenant-registry';

export async function registerTenantBundleRoute(app: FastifyInstance, repo: TenantRegistryRepository) {
  app.get('/control/tenant-bundle', async () => {
    return repo.buildTenantBundle();
  });
}
