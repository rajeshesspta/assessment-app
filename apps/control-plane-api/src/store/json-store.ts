import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';

export interface JsonStoreSnapshot<T> {
  version: string;
  updatedAt: string;
  data: T;
}

function ensureDirectory(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initializeFile<T>(filePath: string, schema: z.ZodType<T>) {
  ensureDirectory(filePath);
  if (!fs.existsSync(filePath)) {
    const now = new Date().toISOString();
    const snapshot: JsonStoreSnapshot<T> = {
      version: '1.0',
      updatedAt: now,
      data: schema.parse({}),
    };
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  }
}

export class JsonStore<T> {
  private readonly filePath: string;

  constructor(private readonly schema: z.ZodType<T>, filePathResolver: () => string) {
    this.filePath = filePathResolver();
    initializeFile(this.filePath, this.schema);
  }

  read(): JsonStoreSnapshot<T> {
    const payload = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(payload);
    return {
      ...parsed,
      data: this.schema.parse(parsed.data ?? {}),
    };
  }

  write(snapshot: JsonStoreSnapshot<T>) {
    ensureDirectory(this.filePath);
    fs.writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2));
  }
}
