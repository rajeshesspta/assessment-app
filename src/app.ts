import Fastify from 'fastify';
import { registerAuth } from './modules/auth/auth.middleware.js';
import { itemRoutes } from './modules/items/item.routes.js';
import { assessmentRoutes } from './modules/assessments/assessment.routes.js';
import { attemptRoutes } from './modules/attempts/attempt.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  // Register auth & tenant enforcement
  app.addHook('onRequest', registerAuth);

  // Routes
  app.register(itemRoutes, { prefix: '/items' });
  app.register(assessmentRoutes, { prefix: '/assessments' });
  app.register(attemptRoutes, { prefix: '/attempts' });
  app.register(analyticsRoutes, { prefix: '/analytics' });

  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}
