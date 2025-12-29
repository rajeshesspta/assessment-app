import type { Database } from 'sql.js';
import type { TaxonomyConfig } from '../../common/types.js';
import type { SQLiteTenantClient } from '../../infrastructure/sqlite/client.js';

export interface TaxonomyRepository {
	getTaxonomyConfig(tenantId: string): Promise<TaxonomyConfig | null>;
	upsertTaxonomyConfig(tenantId: string, config: TaxonomyConfig): Promise<void>;
}

class InMemoryTaxonomyRepository implements TaxonomyRepository {
	private store = new Map<string, TaxonomyConfig>();

	async getTaxonomyConfig(tenantId: string): Promise<TaxonomyConfig | null> {
		return this.store.get(tenantId) || null;
	}

	async upsertTaxonomyConfig(tenantId: string, config: TaxonomyConfig): Promise<void> {
		this.store.set(tenantId, config);
	}
}

export class SqliteTaxonomyRepository implements TaxonomyRepository {
	constructor(private client: SQLiteTenantClient) {}

	async getTaxonomyConfig(tenantId: string): Promise<TaxonomyConfig | null> {
		const db = this.client.getConnection(tenantId);
		const row = db
			.prepare('SELECT config_json FROM taxonomy_config WHERE tenant_id = ?')
			.get(tenantId) as { config_json: string } | undefined;
		if (row?.config_json) {
			return JSON.parse(row.config_json);
		}
		return null;
	}

	async upsertTaxonomyConfig(tenantId: string, config: TaxonomyConfig): Promise<void> {
		const db = this.client.getConnection(tenantId);
		const configJson = JSON.stringify(config);
		db.prepare(`
			INSERT OR REPLACE INTO taxonomy_config (tenant_id, config_json, updated_at)
			VALUES (?, ?, CURRENT_TIMESTAMP)
		`).run(tenantId, configJson);
	}
}

export function createInMemoryTaxonomyRepository(): TaxonomyRepository {
	return new InMemoryTaxonomyRepository();
}

export function createSQLiteTaxonomyRepository(client: SQLiteTenantClient): TaxonomyRepository {
	return new SqliteTaxonomyRepository(client);
}