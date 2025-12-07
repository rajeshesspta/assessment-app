import type { Container } from '@azure/cosmos';
import type { SQLiteDatabase } from '../db/sqlite';

export interface EngineSizeRow {
  id: string;
  name: string;
  description: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface EngineSizeStore {
  listEngineSizes(): Promise<EngineSizeRow[]>;
  getEngineSize(id: string): Promise<EngineSizeRow | undefined>;
  insertEngineSize(payload: EngineSizeRow): Promise<void>;
  updateEngineSize(payload: EngineSizeRow): Promise<void>;
  deleteEngineSize(id: string): Promise<void>;
}

export class SqliteEngineSizeStore implements EngineSizeStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async listEngineSizes(): Promise<EngineSizeRow[]> {
    return this.db
      .prepare(
        `
        SELECT id, name, description, metadata_json, created_at, updated_at
        FROM engine_sizes
        ORDER BY name ASC
      `,
      )
      .all();
  }

  async getEngineSize(id: string): Promise<EngineSizeRow | undefined> {
    return this.db
      .prepare(
        `
        SELECT id, name, description, metadata_json, created_at, updated_at
        FROM engine_sizes
        WHERE id = ?
      `,
      )
      .get(id);
  }

  async insertEngineSize(payload: EngineSizeRow): Promise<void> {
    this.db
      .prepare(
        `
        INSERT INTO engine_sizes (id, name, description, metadata_json, created_at, updated_at)
        VALUES (@id, @name, @description, @metadata_json, @created_at, @updated_at)
      `,
      )
      .run(payload);
  }

  async updateEngineSize(payload: EngineSizeRow): Promise<void> {
    this.db
      .prepare(
        `
        UPDATE engine_sizes
        SET name = @name,
            description = @description,
            metadata_json = @metadata_json,
            updated_at = @updated_at
        WHERE id = @id
      `,
      )
      .run(payload);
  }

  async deleteEngineSize(id: string): Promise<void> {
    this.db.prepare('DELETE FROM engine_sizes WHERE id = ?').run(id);
  }
}

export class CosmosEngineSizeStore implements EngineSizeStore {
  constructor(private readonly container: Container) {}

  async listEngineSizes(): Promise<EngineSizeRow[]> {
    const querySpec = { query: 'SELECT * FROM c ORDER BY c.name ASC' };
    const { resources } = await this.container.items.query<EngineSizeRow>(querySpec).fetchAll();
    return resources ?? [];
  }

  async getEngineSize(id: string): Promise<EngineSizeRow | undefined> {
    try {
      const { resource } = await this.container.item(id, id).read<EngineSizeRow>();
      return resource ?? undefined;
    } catch (error: any) {
      if (error?.code === 404) {
        return undefined;
      }
      throw error;
    }
  }

  async insertEngineSize(payload: EngineSizeRow): Promise<void> {
    await this.container.items.create(payload);
  }

  async updateEngineSize(payload: EngineSizeRow): Promise<void> {
    await this.container.items.upsert(payload);
  }

  async deleteEngineSize(id: string): Promise<void> {
    await this.container.item(id, id).delete();
  }
}
