import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  HEADLESS_API_BASE_URL: z.string().url(),
  CONSUMER_API_KEY: z.string().min(1),
  CONSUMER_TENANT_ID: z.string().min(1),
  CONSUMER_ACTOR_ROLES: z.string().min(1).default('LEARNER'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('localhost'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().min(1).default('http://localhost:4000/auth/google/callback'),
  CLIENT_APP_URL: z.string().min(1).default('http://localhost:5173'),
  CLIENT_APP_LANDING_PATH: z.string().default('/overview'),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 4),
});

const env = envSchema.parse({
  HEADLESS_API_BASE_URL: process.env.HEADLESS_API_BASE_URL ?? process.env.API_BASE_URL,
  CONSUMER_API_KEY: process.env.CONSUMER_API_KEY,
  CONSUMER_TENANT_ID: process.env.CONSUMER_TENANT_ID,
  CONSUMER_ACTOR_ROLES: process.env.CONSUMER_ACTOR_ROLES ?? 'LEARNER',
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  CLIENT_APP_URL: process.env.CLIENT_APP_URL,
  CLIENT_APP_LANDING_PATH: process.env.CLIENT_APP_LANDING_PATH,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SESSION_TTL_SECONDS: process.env.SESSION_TTL_SECONDS,
});

const clientAppEntries = env.CLIENT_APP_URL.split(',').map(entry => entry.trim()).filter(Boolean);
if (clientAppEntries.length === 0) {
  throw new Error('CLIENT_APP_URL must include at least one URL');
}
const clientAppUrls = clientAppEntries.map(entry => {
  try {
    return new URL(entry);
  } catch (error) {
    throw new Error(`CLIENT_APP_URL entry "${entry}" is not a valid URL`);
  }
});
const googleRedirectEntries = env.GOOGLE_REDIRECT_URI.split(',').map(entry => entry.trim()).filter(Boolean);
if (googleRedirectEntries.length === 0) {
  throw new Error('GOOGLE_REDIRECT_URI must include at least one URL');
}
const googleRedirectUrls = googleRedirectEntries.map(entry => {
  try {
    return new URL(entry);
  } catch (error) {
    throw new Error(`GOOGLE_REDIRECT_URI entry "${entry}" is not a valid URL`);
  }
});
const googleRedirectHostMap = new Map<string, URL>();
for (const url of googleRedirectUrls) {
  googleRedirectHostMap.set(url.host.toLowerCase(), url);
}
function selectGoogleRedirectUrl(hostHeader?: string) {
  if (hostHeader) {
    const normalizedHost = hostHeader.toLowerCase();
    const match = googleRedirectHostMap.get(normalizedHost);
    if (match) {
      return match;
    }
  }
  return googleRedirectUrls[0];
}
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = clientAppUrls.map(url => url.origin);
const clientLandingPath = env.CLIENT_APP_LANDING_PATH.startsWith('/')
  ? env.CLIENT_APP_LANDING_PATH
  : `/${env.CLIENT_APP_LANDING_PATH}`;
const primaryClientUrl = clientAppUrls[0];
const landingRedirectUrl = new URL(clientLandingPath, primaryClientUrl).toString();
const SESSION_COOKIE = 'consumer_portal_session';
const STATE_TTL_MS = 5 * 60 * 1000;
const stateStore = new Map<string, number>();
const sessionSecret = new TextEncoder().encode(env.SESSION_SECRET);

type SessionPayload = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  provider: 'google';
};

function createStateToken() {
  const value = randomBytes(16).toString('hex');
  stateStore.set(value, Date.now());
  return value;
}

function validateAndConsumeState(state?: string | null) {
  if (!state) {
    return false;
  }
  const createdAt = stateStore.get(state);
  stateStore.delete(state);
  if (!createdAt) {
    return false;
  }
  return Date.now() - createdAt <= STATE_TTL_MS;
}

async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret);
}

async function verifySessionToken(token: string) {
  return jwtVerify(token, sessionSecret) as Promise<{ payload: SessionPayload }>;
}

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

await app.register(cookie, {
  secret: env.SESSION_SECRET,
  hook: 'onRequest',
});

await app.register(cors, {
  origin(origin, cb) {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error('Origin not allowed'), false);
  },
  credentials: true,
});

app.get('/health', () => ({ status: 'ok' }));

app.get('/auth/google/login', async (request, reply) => {
  const redirectTarget = selectGoogleRedirectUrl(request.headers.host);
  const state = createStateToken();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectTarget.toString(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();
  reply.redirect(authUrl.toString());
});

const googleCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

app.get('/auth/google/callback', async (request, reply) => {
  const parsed = googleCallbackSchema.safeParse(request.query ?? {});
  if (!parsed.success) {
    reply.code(400);
    return { error: 'Invalid callback response' };
  }
  const { code, state, error } = parsed.data;
  if (error) {
    reply.code(400);
    return { error };
  }
  if (!code || !validateAndConsumeState(state)) {
    reply.code(400);
    return { error: 'Invalid OAuth state' };
  }

  const redirectTarget = selectGoogleRedirectUrl(request.headers.host);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectTarget.toString(),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const details = await tokenResponse.text();
    reply.code(502);
    return { error: 'Failed to exchange Google authorization code', details };
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) {
    reply.code(502);
    return { error: 'Google token response missing access token' };
  }

  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileResponse.ok) {
    const details = await profileResponse.text();
    reply.code(502);
    return { error: 'Failed to fetch Google profile', details };
  }

  const profile = (await profileResponse.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!profile.email) {
    reply.code(400);
    return { error: 'Google account is missing an email claim' };
  }

  const sessionToken = await createSessionToken({
    sub: profile.sub,
    email: profile.email,
    name: profile.name ?? profile.email,
    picture: profile.picture,
    provider: 'google',
  });
console.log('sessionToken:', sessionToken);
  reply
    .setCookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: env.SESSION_TTL_SECONDS,
    })
    .redirect(landingRedirectUrl);
});

app.get('/auth/session', async (request, reply) => {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    reply.code(401);
    return { error: 'Not authenticated' };
  }
  try {
    const { payload } = await verifySessionToken(token);
    return { user: payload };
  } catch {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(401);
    return { error: 'Invalid session' };
  }
});

app.post('/auth/logout', async (_request, reply) => {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
    httpOnly: true,
  });
  return { status: 'signed_out' };
});

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
