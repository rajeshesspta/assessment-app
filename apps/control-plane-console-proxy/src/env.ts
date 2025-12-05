import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().default(4700),
  HOST: z.string().default('0.0.0.0'),
  CONTROL_PLANE_BASE_URL: z.string().url(),
  CONTROL_PLANE_API_KEY: z.string().min(32, 'CONTROL_PLANE_API_KEY must be at least 32 characters'),
  CONSOLE_BASIC_USER: z.string().min(1),
  CONSOLE_BASIC_PASS: z.string().min(12, 'CONSOLE_BASIC_PASS should be at least 12 characters'),
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  CONTROL_PLANE_BASE_URL: process.env.CONTROL_PLANE_BASE_URL,
  CONTROL_PLANE_API_KEY: process.env.CONTROL_PLANE_API_KEY,
  CONSOLE_BASIC_USER: process.env.CONSOLE_BASIC_USER,
  CONSOLE_BASIC_PASS: process.env.CONSOLE_BASIC_PASS,
});
