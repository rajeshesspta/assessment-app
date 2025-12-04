import { CosmosClient } from '@azure/cosmos';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './env';
import { TenantRegistryRepository } from './repositories/tenant-registry';
import { registerTenantRoutes } from './routes/tenants';
import { registerTenantBundleRoute } from './routes/tenant-bundle';
import { runMigrations } from './db/migrations';
import { createTenantRegistryDatabase } from './db/connection';
import { CosmosTenantRegistryStore, SqliteTenantRegistryStore } from './stores/tenant-registry-store';

interface ServerDependencies {
  repository: TenantRegistryRepository;
}

export async function buildServer({ repository }: ServerDependencies): Promise<FastifyInstance> {
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
    const tenants = await repository.listTenants();
    return {
      status: 'ok',
      tenants: tenants.length,
    };
  });

  await registerTenantRoutes(app, repository);
  await registerTenantBundleRoute(app, repository);

  return app;
}

function createTenantRegistryRepository(): TenantRegistryRepository {
  if (env.CONTROL_PLANE_DB_PROVIDER === 'sqlite') {
    const db = createTenantRegistryDatabase();
    runMigrations(db);
    const store = new SqliteTenantRegistryStore(db);
    return new TenantRegistryRepository(store);
  }

  const client = new CosmosClient({ endpoint: env.CONTROL_PLANE_COSMOS_ENDPOINT, key: env.CONTROL_PLANE_COSMOS_KEY });
  const database = client.database(env.CONTROL_PLANE_COSMOS_DATABASE);
  const tenants = database.container(env.CONTROL_PLANE_COSMOS_TENANTS_CONTAINER);
  const audit = database.container(env.CONTROL_PLANE_COSMOS_AUDIT_CONTAINER);
  const store = new CosmosTenantRegistryStore(tenants, audit);
  return new TenantRegistryRepository(store);
}

const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

if (!isTestEnv) {
  const repository = createTenantRegistryRepository();
  const app = await buildServer({ repository });

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
