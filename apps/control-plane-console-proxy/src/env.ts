import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const defaultDbPath = path.join(process.cwd(), 'data', 'control-plane', 'console-proxy.db');

const envSchema = z.object({
  PORT: z.coerce.number().default(4700),
  HOST: z.string().default('0.0.0.0'),
  CONTROL_PLANE_BASE_URL: z.string().url(),
  CONTROL_PLANE_API_KEY: z.string().min(32, 'CONTROL_PLANE_API_KEY must be at least 32 characters'),
  CONSOLE_BASIC_USER: z.string().min(1),
  CONSOLE_BASIC_PASS: z.string().min(12, 'CONSOLE_BASIC_PASS should be at least 12 characters'),
  CONSOLE_SESSION_SECRET: z.string().min(32, 'CONSOLE_SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 30),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  CONSOLE_DB_PATH: z.string().default(defaultDbPath),
  CONSOLE_DB_PROVIDER: z.enum(['sqlite', 'memory', 'cosmos']).default('sqlite'),
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  CONTROL_PLANE_BASE_URL: process.env.CONTROL_PLANE_BASE_URL,
  CONTROL_PLANE_API_KEY: process.env.CONTROL_PLANE_API_KEY,
  CONSOLE_BASIC_USER: process.env.CONSOLE_BASIC_USER,
  CONSOLE_BASIC_PASS: process.env.CONSOLE_BASIC_PASS,
  CONSOLE_SESSION_SECRET: process.env.CONSOLE_SESSION_SECRET,
  SESSION_TTL_SECONDS: process.env.SESSION_TTL_SECONDS,
  OTP_TTL_SECONDS: process.env.OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS: process.env.OTP_MAX_ATTEMPTS,
  CONSOLE_DB_PATH: process.env.CONSOLE_DB_PATH,
  CONSOLE_DB_PROVIDER: process.env.CONSOLE_DB_PROVIDER,
});
