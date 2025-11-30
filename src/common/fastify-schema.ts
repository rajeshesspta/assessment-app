import type { FastifySchema, FastifySchemaCompiler } from 'fastify';

export const passThroughValidator: FastifySchemaCompiler<FastifySchema> = () => {
  return data => ({ value: data });
};
