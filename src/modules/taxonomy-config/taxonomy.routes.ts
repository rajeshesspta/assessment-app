import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TaxonomyRepository } from './taxonomy.repository.js';
import type { TaxonomyConfig } from '../../common/types.js';

const taxonomyConfigSchema = z.object({
  categories: z.array(z.string()).default([]),
  tags: z.object({
    predefined: z.array(z.string()).default([]),
    allowCustom: z.boolean().default(true),
  }).default({ predefined: [], allowCustom: true }),
  metadataFields: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'enum', 'array', 'object']),
    required: z.boolean().default(false),
    allowedValues: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
    description: z.string().optional(),
  })).default([]),
});

export async function registerTaxonomyRoutes(
	app: FastifyInstance,
	{ taxonomyRepo }: { taxonomyRepo: TaxonomyRepository },
) {
	app.get('/config/taxonomy', async (request, reply) => {
		const tenantId = (request as any).tenantId as string;
		const actorRoles = (request as any).actorRoles as string[];

		if (!actorRoles.includes('TENANT_ADMIN') && !actorRoles.includes('CONTENT_AUTHOR')) {
			reply.code(403);
			return { error: 'Forbidden: only tenant admins and content authors can access taxonomy config' };
		}

		const config = await taxonomyRepo.getTaxonomyConfig(tenantId);
		// Always return the new tags object format
		if (config) {
			request.log.info({ retrievedTaxonomyConfig: config }, 'Retrieved taxonomy config');
			return {
				...config,
				tags: config.tags && Array.isArray(config.tags.predefined)
					? config.tags
					: { predefined: Array.isArray(config.tags) ? config.tags : [], allowCustom: true },
			};
		}
		request.log.info('No taxonomy config found, returning defaults');
		return {
			categories: [],
			tags: { predefined: [], allowCustom: true },
			metadataFields: []
		};
	});

	app.put('/config/taxonomy', async (request, reply) => {
		const tenantId = (request as any).tenantId as string;
		const actorRoles = (request as any).actorRoles as string[];

		if (!actorRoles.includes('TENANT_ADMIN')) {
			reply.code(403);
			return { error: 'Forbidden: only tenant admins can update taxonomy config' };
		}

		const parsed = taxonomyConfigSchema.safeParse(request.body);
		if (!parsed.success) {
			reply.code(400);
			return { error: 'Invalid taxonomy config', issues: parsed.error.issues };
		}

		// TODO: Validation to ensure changes don't break existing items

		await taxonomyRepo.upsertTaxonomyConfig(tenantId, parsed.data);
		return { success: true };
	});
}