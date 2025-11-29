import Fastify from 'fastify';
import { registerAuth } from './modules/auth/auth.middleware.js';
import { itemRoutes } from './modules/items/item.routes.js';
import { assessmentRoutes } from './modules/assessments/assessment.routes.js';
import { attemptRoutes } from './modules/attempts/attempt.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import {
  createInMemoryRepositoryBundle,
  type RepositoryBundle,
} from './infrastructure/repositories.js';
import { tenantRoutes } from './modules/tenants/tenant.routes.js';
import {
  createInMemoryTenantRepository,
  type TenantRepository,
} from './modules/tenants/tenant.repository.js';

export interface AppDependencies {
  repositories?: RepositoryBundle;
  tenantRepository?: TenantRepository;
}

export function buildApp(deps: AppDependencies = {}) {
  const app = Fastify({ logger: true });
  const repositories = deps.repositories ?? createInMemoryRepositoryBundle();
  const tenantRepository = deps.tenantRepository ?? createInMemoryTenantRepository();

  // Register auth & tenant enforcement
  app.addHook('onRequest', async (request, reply) => {
    if (request.raw.url?.startsWith('/health')) {
      return;
    }
    await registerAuth(request, reply);
  });

  // Routes
  app.register(itemRoutes, { prefix: '/items', repository: repositories.item });
  app.register(assessmentRoutes, { prefix: '/assessments', repository: repositories.assessment });
  app.register(attemptRoutes, {
    prefix: '/attempts',
    attemptRepository: repositories.attempt,
    assessmentRepository: repositories.assessment,
    itemRepository: repositories.item,
  });
  app.register(analyticsRoutes, { prefix: '/analytics', attemptRepository: repositories.attempt });
  app.register(userRoutes, { prefix: '/users', repository: repositories.user });
  app.register(tenantRoutes, {
    prefix: '/tenants',
    repository: tenantRepository,
    userRepository: repositories.user,
  });

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
