import { CosmosClient } from '@azure/cosmos';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './env';
import { TenantRegistryRepository } from './repositories/tenant-registry';
import { EngineSizeRepository } from './repositories/engine-size';
import { registerTenantRoutes } from './routes/tenants';
import { registerTenantBundleRoute } from './routes/tenant-bundle';
import { registerEngineSizeRoutes } from './routes/engine-sizes';
import { runMigrations } from './db/migrations';
import { createTenantRegistryDatabase } from './db/connection';
import { CosmosTenantRegistryStore, SqliteTenantRegistryStore } from './stores/tenant-registry-store';
import { CosmosEngineSizeStore, SqliteEngineSizeStore } from './stores/engine-size-store';

interface ServerDependencies {
  tenantRepository: TenantRegistryRepository;
  engineSizeRepository: EngineSizeRepository;
}

export async function buildServer({ tenantRepository, engineSizeRepository }: ServerDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.addHook('onRequest', (request, reply, done) => {
    const apiKey = request.headers['x-control-plane-key'];
    if (apiKey !== env.CONTROL_PLANE_API_KEY) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    done();
  });

  app.get('/control/health', async () => {
    const tenants = await tenantRepository.listTenants();
    return {
      status: 'ok',
      tenants: tenants.length,
    };
  });

  await registerTenantRoutes(app, tenantRepository, engineSizeRepository);
  await registerEngineSizeRoutes(app, engineSizeRepository, tenantRepository);
  await registerTenantBundleRoute(app, tenantRepository);

  return app;
}

function createRepositories(): { tenantRepository: TenantRegistryRepository; engineSizeRepository: EngineSizeRepository } {
  if (env.CONTROL_PLANE_DB_PROVIDER === 'sqlite') {
    const db = createTenantRegistryDatabase();
    runMigrations(db);
    const tenantStore = new SqliteTenantRegistryStore(db);
    const engineSizeStore = new SqliteEngineSizeStore(db);
    return {
      tenantRepository: new TenantRegistryRepository(tenantStore),
      engineSizeRepository: new EngineSizeRepository(engineSizeStore),
    };
  }

  const client = new CosmosClient({ endpoint: env.CONTROL_PLANE_COSMOS_ENDPOINT, key: env.CONTROL_PLANE_COSMOS_KEY });
  const database = client.database(env.CONTROL_PLANE_COSMOS_DATABASE);
  const tenants = database.container(env.CONTROL_PLANE_COSMOS_TENANTS_CONTAINER);
  const audit = database.container(env.CONTROL_PLANE_COSMOS_AUDIT_CONTAINER);
  const engineSizes = database.container(env.CONTROL_PLANE_COSMOS_ENGINE_SIZES_CONTAINER);
  const tenantStore = new CosmosTenantRegistryStore(tenants, audit);
  const engineSizeStore = new CosmosEngineSizeStore(engineSizes);
  return {
    tenantRepository: new TenantRegistryRepository(tenantStore),
    engineSizeRepository: new EngineSizeRepository(engineSizeStore),
  };
}

const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

if (!isTestEnv) {
  const { tenantRepository, engineSizeRepository } = createRepositories();
  const app = await buildServer({ tenantRepository, engineSizeRepository });

  app
    .listen({ port: env.PORT, host: env.HOST })
    .then(() => {
      app.log.info(`Control Plane API listening on http://${env.HOST}:${env.PORT}`);
    })
    .catch(error => {
      app.log.error(error, 'Failed to start Control Plane API');
      process.exit(1);
    });
}
