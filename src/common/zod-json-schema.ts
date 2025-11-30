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
  type ZodJsonOptions = Parameters<typeof zodToJsonSchema>[1];
  const baseOptions: ZodJsonOptions = { $refStrategy: 'none' };
  const options = name
    ? ({ ...baseOptions, name, nameStrategy: 'title' } as ZodJsonOptions)
    : baseOptions;
  const jsonSchema = zodToJsonSchema(schema, options);
  const stripped = stripDefaults(jsonSchema) as Record<string, unknown>;
  delete stripped.$schema;
  delete stripped.definitions;
  delete stripped.$defs;
  delete stripped.components;
  if ('$ref' in stripped) {
    delete stripped.$ref;
  }
  return stripped;
}
