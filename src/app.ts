import Fastify from 'fastify';
import { registerAuth } from './modules/auth/auth.middleware.js';
import { itemRoutes } from './modules/items/item.routes.js';
import { assessmentRoutes } from './modules/assessments/assessment.routes.js';
import { attemptRoutes } from './modules/attempts/attempt.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import {
  createInMemoryRepositoryBundle,
  type RepositoryBundle,
} from './infrastructure/repositories.js';

export interface AppDependencies {
  repositories?: RepositoryBundle;
}

export function buildApp(deps: AppDependencies = {}) {
  const app = Fastify({ logger: true });
  const repositories = deps.repositories ?? createInMemoryRepositoryBundle();

  // Register auth & tenant enforcement
  app.addHook('onRequest', registerAuth);

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

  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}
