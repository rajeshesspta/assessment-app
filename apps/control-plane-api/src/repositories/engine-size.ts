import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { EngineSizeStore, EngineSizeRow } from '../stores/engine-size-store';

const metadataSchema = z.record(z.unknown()).optional();

const engineSizeRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().max(280).optional(),
  metadata: metadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const engineSizeInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().max(280).optional(),
  metadata: metadataSchema,
});

const engineSizePatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().max(280).optional(),
    metadata: metadataSchema,
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export type EngineSizeRecord = z.infer<typeof engineSizeRecordSchema>;
export type EngineSizeInput = z.infer<typeof engineSizeInputSchema>;
export type EngineSizePatch = z.infer<typeof engineSizePatchSchema>;

function serializeMetadata(value: EngineSizeRecord['metadata']): string | null {
  return value ? JSON.stringify(value) : null;
}

export class EngineSizeRepository {
  constructor(private readonly store: EngineSizeStore) {}

  async listEngineSizes(): Promise<EngineSizeRecord[]> {
    const rows = await this.store.listEngineSizes();
    return rows.map(row => this.rowToRecord(row));
  }

  async getEngineSize(id: string): Promise<EngineSizeRecord | undefined> {
    const row = await this.store.getEngineSize(id);
    return row ? this.rowToRecord(row) : undefined;
  }

  async createEngineSize(input: EngineSizeInput): Promise<EngineSizeRecord> {
    const parsed = engineSizeInputSchema.parse(input);
    const now = new Date().toISOString();
    const row: EngineSizeRow = {
      id: randomUUID(),
      name: parsed.name.trim(),
      description: parsed.description?.trim() ?? null,
      metadata_json: serializeMetadata(parsed.metadata),
      created_at: now,
      updated_at: now,
    };
    await this.store.insertEngineSize(row);
    return this.rowToRecord(row);
  }

  async updateEngineSize(id: string, patch: EngineSizePatch): Promise<EngineSizeRecord> {
    const parsed = engineSizePatchSchema.parse(patch);
    const existing = await this.store.getEngineSize(id);
    if (!existing) {
      throw new Error('Engine size not found');
    }
    const next: EngineSizeRow = {
      ...existing,
      name: parsed.name ? parsed.name.trim() : existing.name,
      description:
        parsed.description !== undefined ? (parsed.description?.trim() || null) : existing.description,
      metadata_json:
        parsed.metadata !== undefined ? serializeMetadata(parsed.metadata) : existing.metadata_json,
      updated_at: new Date().toISOString(),
    };
    await this.store.updateEngineSize(next);
    return this.rowToRecord(next);
  }

  async deleteEngineSize(id: string): Promise<void> {
    await this.store.deleteEngineSize(id);
  }

  private rowToRecord(row: EngineSizeRow): EngineSizeRecord {
    return engineSizeRecordSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
