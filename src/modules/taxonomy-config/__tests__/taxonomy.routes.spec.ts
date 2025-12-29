import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getTaxonomyConfigMock, upsertTaxonomyConfigMock } = vi.hoisted(() => ({
  getTaxonomyConfigMock: vi.fn(),
  upsertTaxonomyConfigMock: vi.fn(),
}));

const mockTaxonomyRepo = {
  getTaxonomyConfig: getTaxonomyConfigMock,
  upsertTaxonomyConfig: upsertTaxonomyConfigMock,
};

vi.mock('../taxonomy.repository.js', () => ({
  createInMemoryTaxonomyRepository: vi.fn(() => mockTaxonomyRepo),
  createSQLiteTaxonomyRepository: vi.fn(() => mockTaxonomyRepo),
}));

import { registerTaxonomyRoutes } from '../taxonomy.routes.js';

let currentActorRoles: string[] = ['TENANT_ADMIN'];

async function buildTestApp() {
  const app = Fastify();
  app.addHook('onRequest', async request => {
    (request as any).tenantId = 'tenant-1';
    (request as any).actorRoles = currentActorRoles;
  });

  await app.register(registerTaxonomyRoutes, { taxonomyRepo: mockTaxonomyRepo });
  return app;
}

describe('configRoutes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    currentActorRoles = ['TENANT_ADMIN'];
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /config/taxonomy', () => {
    it('returns taxonomy config for tenant admin', async () => {
      const config = {
        categories: { name: 'categories', type: 'array', required: false },
        tags: { name: 'tags', type: 'array', required: false },
        metadata: {},
      };
      getTaxonomyConfigMock.mockResolvedValue(config);

      const response = await app.inject({
        method: 'GET',
        url: '/config/taxonomy',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(config);
      expect(getTaxonomyConfigMock).toHaveBeenCalledWith('tenant-1');
    });

    it('returns default config if none exists', async () => {
      getTaxonomyConfigMock.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/config/taxonomy',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        categories: {
          name: 'categories',
          type: 'array',
          required: false,
          description: 'Categories for organizing items'
        },
        tags: {
          name: 'tags',
          type: 'array',
          required: false,
          description: 'Tags for additional item classification'
        },
        metadata: {},
      });
    });

    it('returns 403 for non-tenant-admin', async () => {
      currentActorRoles = ['CONTENT_AUTHOR'];

      const response = await app.inject({
        method: 'GET',
        url: '/config/taxonomy',
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Forbidden: only tenant admins can access taxonomy config',
      });
    });
  });

  describe('PUT /config/taxonomy', () => {
    it('updates taxonomy config for tenant admin', async () => {
      const config = {
        categories: { name: 'categories', type: 'array', required: false },
        tags: { name: 'tags', type: 'array', required: false },
        metadata: {},
      };
      upsertTaxonomyConfigMock.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'PUT',
        url: '/config/taxonomy',
        payload: config,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });
      expect(upsertTaxonomyConfigMock).toHaveBeenCalledWith('tenant-1', config);
    });

    it('returns 400 for invalid config', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/config/taxonomy',
        payload: { invalid: 'config' },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Invalid taxonomy config');
    });

    it('returns 403 for non-tenant-admin', async () => {
      currentActorRoles = ['CONTENT_AUTHOR'];

      const response = await app.inject({
        method: 'PUT',
        url: '/config/taxonomy',
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toEqual({
        error: 'Forbidden: only tenant admins can update taxonomy config',
      });
    });
  });
});