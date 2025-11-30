import Fastify from 'fastify';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  HEADLESS_API_BASE_URL: z.string().url(),
  CONSUMER_API_KEY: z.string().min(1),
  CONSUMER_TENANT_ID: z.string().min(1),
  CONSUMER_ACTOR_ROLES: z.string().min(1).default('LEARNER'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('127.0.0.1'),
});

const env = envSchema.parse({
  HEADLESS_API_BASE_URL: process.env.HEADLESS_API_BASE_URL ?? process.env.API_BASE_URL,
  CONSUMER_API_KEY: process.env.CONSUMER_API_KEY,
  CONSUMER_TENANT_ID: process.env.CONSUMER_TENANT_ID,
  CONSUMER_ACTOR_ROLES: process.env.CONSUMER_ACTOR_ROLES ?? 'LEARNER',
  PORT: process.env.PORT,
  HOST: process.env.HOST,
});

class HeadlessRequestError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

async function callHeadless<T>(path: string, init?: RequestInit, actorRoles?: string): Promise<T> {
  const url = new URL(path, env.HEADLESS_API_BASE_URL);
  const headers: HeadersInit = {
    'content-type': 'application/json',
    'x-api-key': env.CONSUMER_API_KEY,
    'x-tenant-id': env.CONSUMER_TENANT_ID,
    'x-actor-roles': actorRoles ?? env.CONSUMER_ACTOR_ROLES,
    ...(init?.headers ?? {}),
  };
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : (payload as { error?: string }).error ?? 'Headless API error';
    throw new HeadlessRequestError(message, response.status);
  }
  return payload as T;
}

const app = Fastify({
  logger: true,
});

app.get('/health', () => ({ status: 'ok' }));

app.get('/api/analytics/assessments/:id', async (request, reply) => {
  const assessmentId = (request.params as { id: string }).id;
  const actorRoles = (request.headers['x-actor-roles'] as string | undefined)?.trim();
  try {
    return await callHeadless(`/analytics/assessments/${assessmentId}`, undefined, actorRoles);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

const startAttemptSchema = z.object({
  assessmentId: z.string().min(1),
  userId: z.string().min(1),
});

app.post('/api/attempts', async (request, reply) => {
  const parsed = startAttemptSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    reply.code(400);
    return { error: 'Invalid payload', issues: parsed.error.issues };
  }
  const actorRoles = (request.headers['x-actor-roles'] as string | undefined)?.trim();
  try {
    return await callHeadless('/attempts', {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    }, actorRoles);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/attempts/:id', async (request, reply) => {
  const attemptId = (request.params as { id: string }).id;
  const actorRoles = (request.headers['x-actor-roles'] as string | undefined)?.trim();
  try {
    return await callHeadless(`/attempts/${attemptId}`, undefined, actorRoles);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.listen({ port: env.PORT, host: env.HOST })
  .then(() => {
    app.log.info(`Consumer BFF listening on http://${env.HOST}:${env.PORT}`);
  })
  .catch((error) => {
    app.log.error(error, 'Failed to start BFF');
    process.exit(1);
  });
