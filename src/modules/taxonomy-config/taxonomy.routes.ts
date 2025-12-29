import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TaxonomyRepository } from './taxonomy.repository.js';
import type { TaxonomyConfig } from '../../common/types.js';

const taxonomyConfigSchema = z.object({
	categories: z.object({
		name: z.string(),
		type: z.enum(['string', 'number', 'boolean', 'array']),
		required: z.boolean(),
		allowedValues: z.array(z.string()).optional(),
		description: z.string().optional(),
	}),
	tags: z.object({
		name: z.string(),
		type: z.enum(['string', 'number', 'boolean', 'array']),
		required: z.boolean(),
		allowedValues: z.array(z.string()).optional(),
		description: z.string().optional(),
	}),
	metadata: z.record(z.string(), z.object({
		name: z.string(),
		type: z.enum(['string', 'number', 'boolean', 'array']),
		required: z.boolean(),
		allowedValues: z.array(z.string()).optional(),
		description: z.string().optional(),
	})),
});

export async function registerTaxonomyRoutes(
	app: FastifyInstance,
	{ taxonomyRepo }: { taxonomyRepo: TaxonomyRepository },
) {
	app.get('/config/taxonomy', async (request, reply) => {
		const tenantId = (request as any).tenantId as string;
		const actorRoles = (request as any).actorRoles as string[];

		if (!actorRoles.includes('TENANT_ADMIN')) {
			reply.code(403);
			return { error: 'Forbidden: only tenant admins can access taxonomy config' };
		}

		const config = await taxonomyRepo.getTaxonomyConfig(tenantId);
		return config || { categories: null, tags: null, metadata: {} };
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