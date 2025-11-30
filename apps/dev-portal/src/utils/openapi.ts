import type { OpenAPIV3 } from 'openapi-types';

const SAMPLE_UUID = '00000000-0000-0000-0000-000000000000';
const SAMPLE_DATE = '2024-01-01';
const SAMPLE_DATE_TIME = '2024-01-01T00:00:00.000Z';

export function resolveSchemaObject(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
  components?: OpenAPIV3.ComponentsObject,
  seen: Set<string> = new Set(),
): OpenAPIV3.SchemaObject | undefined {
  if (!schema) {
    return undefined;
  }

  if ('$ref' in schema) {
    const ref = schema.$ref;
    if (!ref.startsWith('#/components/schemas/')) {
      return undefined;
    }
    if (seen.has(ref)) {
      return undefined;
    }
    const key = ref.replace('#/components/schemas/', '');
    const next = components?.schemas?.[key] as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined;
    if (!next) {
      return undefined;
    }
    seen.add(ref);
    return resolveSchemaObject(next, components, seen);
  }

  return schema;
}

function mergeObjects(target: Record<string, unknown>, source: unknown) {
  if (!source || typeof source !== 'object') {
    return target;
  }
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    target[key] = value;
  }
  return target;
}

function scalarExample(schema: OpenAPIV3.SchemaObject): unknown {
  if (schema.enum?.length) {
    return schema.enum[0];
  }
  if (schema.format === 'uuid') return SAMPLE_UUID;
  if (schema.format === 'date-time') return SAMPLE_DATE_TIME;
  if (schema.format === 'date') return SAMPLE_DATE;
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return true;
    default:
      return null;
  }
}

export function generateExampleFromSchema(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined,
  components?: OpenAPIV3.ComponentsObject,
  depth = 0,
): unknown {
  if (!schema || depth > 8) {
    return null;
  }

  const resolved = resolveSchemaObject(schema, components);
  if (!resolved) {
    return null;
  }

  if (resolved.example !== undefined) {
    return resolved.example;
  }
  if (resolved.default !== undefined) {
    return resolved.default;
  }

  if (resolved.oneOf?.length) {
    return generateExampleFromSchema(resolved.oneOf[0], components, depth + 1);
  }
  if (resolved.anyOf?.length) {
    return generateExampleFromSchema(resolved.anyOf[0], components, depth + 1);
  }
  if (resolved.allOf?.length) {
    return resolved.allOf.reduce<Record<string, unknown>>((acc, child) => {
      const example = generateExampleFromSchema(child, components, depth + 1);
      mergeObjects(acc, example as Record<string, unknown>);
      return acc;
    }, {});
  }

  if (resolved.type === 'object' || resolved.properties) {
    const example: Record<string, unknown> = {};
    const properties = resolved.properties ?? {};
    for (const [key, value] of Object.entries(properties)) {
      example[key] = generateExampleFromSchema(value, components, depth + 1);
    }
    if (resolved.additionalProperties && typeof resolved.additionalProperties === 'object') {
      example['additionalProperty'] = generateExampleFromSchema(resolved.additionalProperties, components, depth + 1);
    }
    return example;
  }

  if (resolved.type === 'array' && resolved.items) {
    const entry = generateExampleFromSchema(resolved.items, components, depth + 1);
    return entry === null ? [] : [entry];
  }

  return scalarExample(resolved);
}

export function resolveRequestBody(
  requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined,
  components?: OpenAPIV3.ComponentsObject,
): OpenAPIV3.RequestBodyObject | undefined {
  if (!requestBody) {
    return undefined;
  }
  if ('$ref' in requestBody) {
    const ref = requestBody.$ref;
    if (!ref.startsWith('#/components/requestBodies/')) {
      return undefined;
    }
    const key = ref.replace('#/components/requestBodies/', '');
    const resolved = components?.requestBodies?.[key];
    return resolved as OpenAPIV3.RequestBodyObject | undefined;
  }
  return requestBody;
}
