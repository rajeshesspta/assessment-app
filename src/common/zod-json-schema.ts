import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

function stripDefaults<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripDefaults) as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'default') {
        continue;
      }
      next[key] = stripDefaults(nested);
    }
    return next as T;
  }
  return value;
}

export function toJsonSchema(schema: ZodTypeAny, name?: string) {
  const jsonSchema = zodToJsonSchema(schema, { name, $refStrategy: 'none' });
  return stripDefaults(jsonSchema);
}
