import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerAuth } from './modules/auth/auth.middleware.js';
import { itemRoutes } from './modules/items/item.routes.js';
import { registerSnapshotRoutes } from './modules/items/item.snapshot.routes.js';
import { assessmentRoutes } from './modules/assessments/assessment.routes.js';
import { attemptRoutes } from './modules/attempts/attempt.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { cohortRoutes } from './modules/cohorts/cohort.routes.js';
import { registerTaxonomyRoutes } from './modules/taxonomy-config/taxonomy.routes.js';
import {
  createInMemoryRepositoryBundle,
  type RepositoryBundle,
} from './infrastructure/repositories.js';
import { tenantRoutes } from './modules/tenants/tenant.routes.js';
import {
  createInMemoryTenantRepository,
  type TenantRepository,
} from './modules/tenants/tenant.repository.js';
import pkg from '../package.json' with { type: 'json' };

export interface AppDependencies {
  repositories?: RepositoryBundle;
  tenantRepository?: TenantRepository;
}

const apiVersion = typeof pkg?.version === 'string' ? pkg.version : '0.0.0';

export function buildApp(deps: AppDependencies = {}) {
  const app = Fastify({ logger: { level: 'info' } });
  const repositories = deps.repositories ?? createInMemoryRepositoryBundle();
  const tenantRepository = deps.tenantRepository ?? createInMemoryTenantRepository();

  // app.register(swagger, {
  //   openapi: {
  //     info: {
  //       title: 'Assessment Platform API',
  //       description: 'Headless assessment authoring and delivery APIs',
  //       version: apiVersion,
  //     },
  //     servers: [{ url: process.env.API_PUBLIC_URL ?? 'http://localhost:3000', description: 'Local dev server' }],
  //     components: {
  //       securitySchemes: {
  //         ApiKeyHeader: {
  //           type: 'apiKey',
  //           in: 'header',
  //           name: 'x-api-key',
  //           description: 'API key issued per tenant or super admin',
  //         },
  //         TenantHeader: {
  //           type: 'apiKey',
  //           in: 'header',
  //           name: 'x-tenant-id',
  //           description: 'Tenant scope for the request',
  //         },
  //       },
  //     },
  //     security: [
  //       {
  //         ApiKeyHeader: [],
  //         TenantHeader: [],
  //       },
  //     ],
  //   },
  // });

  // app.register(swaggerUi, {
  //   routePrefix: '/docs',
  //   uiConfig: {
  //     docExpansion: 'list',
  //     deepLinking: true,
  //   },
  //   staticCSP: true,
  // });

  // app.setValidatorCompiler(() => {
  //   return data => ({ value: data });
  // });

  // Register auth & tenant enforcement
  app.addHook('onRequest', async (request, reply) => {
    const url = request.raw.url ?? '';
    if (url.startsWith('/health') || url.startsWith('/docs')) {
      return;
    }
    await registerAuth(request, reply, repositories.user);
  });

  // Routes
  app.register(itemRoutes, { prefix: '/items', repository: repositories.item });
  app.register(assessmentRoutes, { prefix: '/assessments', repository: repositories.assessment, cohortRepository: repositories.cohort });
  app.register(attemptRoutes, {
    prefix: '/attempts',
    attemptRepository: repositories.attempt,
    assessmentRepository: repositories.assessment,
    itemRepository: repositories.item,
    userRepository: repositories.user,
    cohortRepository: repositories.cohort,
    // Snapshot repo for serving immutable item copies
    itemSnapshotRepository: repositories.snapshot,
  });
  // Snapshot management routes
  app.register(registerSnapshotRoutes, {
    prefix: '/snapshots',
    repository: repositories.snapshot,
    itemRepository: repositories.item,
    assessmentRepository: repositories.assessment,
  } as any);
  app.register(analyticsRoutes, {
    prefix: '/analytics',
    attemptRepository: repositories.attempt,
    assessmentRepository: repositories.assessment,
    cohortRepository: repositories.cohort,
    itemRepository: repositories.item,
  });
  app.register(userRoutes, { prefix: '/users', repository: repositories.user });
  app.register(cohortRoutes, {
    prefix: '/cohorts',
    repository: repositories.cohort,
    userRepository: repositories.user,
    assessmentRepository: repositories.assessment,
    itemRepository: repositories.item,
    itemSnapshotRepository: repositories.snapshot,
  });
  app.register(tenantRoutes, {
    prefix: '/tenants',
    repository: tenantRepository,
    userRepository: repositories.user,
  });
  app.register(registerTaxonomyRoutes, { taxonomyRepo: repositories.taxonomy });

  app.addHook('onClose', async () => {
    if (repositories.dispose) {
      await repositories.dispose();
    }
    if (tenantRepository.dispose) {
      await tenantRepository.dispose();
    }
  });

  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}
