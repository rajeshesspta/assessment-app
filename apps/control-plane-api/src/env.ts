import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const commonSchema = z.object({
  PORT: z.coerce.number().default(4500),
  HOST: z.string().default('0.0.0.0'),
  CONTROL_PLANE_API_KEY: z.string().min(32, 'CONTROL_PLANE_API_KEY must be at least 32 characters'),
});

const sqliteEnvSchema = commonSchema.extend({
  CONTROL_PLANE_DB_PROVIDER: z.literal('sqlite'),
  CONTROL_PLANE_DB_PATH: z.string().min(1),
});

const cosmosEnvSchema = commonSchema.extend({
  CONTROL_PLANE_DB_PROVIDER: z.literal('cosmos'),
  CONTROL_PLANE_DB_PATH: z.string().optional().default(''),
  CONTROL_PLANE_COSMOS_ENDPOINT: z.string().url(),
  CONTROL_PLANE_COSMOS_KEY: z.string().min(1),
  CONTROL_PLANE_COSMOS_DATABASE: z.string().min(1),
  CONTROL_PLANE_COSMOS_TENANTS_CONTAINER: z.string().min(1),
  CONTROL_PLANE_COSMOS_AUDIT_CONTAINER: z.string().min(1),
});

const envSchema = z.union([sqliteEnvSchema, cosmosEnvSchema]);

export const env = envSchema.parse({
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  CONTROL_PLANE_API_KEY: process.env.CONTROL_PLANE_API_KEY,
  CONTROL_PLANE_DB_PATH: process.env.CONTROL_PLANE_DB_PATH,
  CONTROL_PLANE_DB_PROVIDER: process.env.CONTROL_PLANE_DB_PROVIDER ?? 'sqlite',
  CONTROL_PLANE_COSMOS_ENDPOINT: process.env.CONTROL_PLANE_COSMOS_ENDPOINT,
  CONTROL_PLANE_COSMOS_KEY: process.env.CONTROL_PLANE_COSMOS_KEY,
  CONTROL_PLANE_COSMOS_DATABASE: process.env.CONTROL_PLANE_COSMOS_DATABASE,
  CONTROL_PLANE_COSMOS_TENANTS_CONTAINER: process.env.CONTROL_PLANE_COSMOS_TENANTS_CONTAINER,
  CONTROL_PLANE_COSMOS_AUDIT_CONTAINER: process.env.CONTROL_PLANE_COSMOS_AUDIT_CONTAINER,
});
