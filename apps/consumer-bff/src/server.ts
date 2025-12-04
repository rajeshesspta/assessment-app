import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { buildTenantRuntimeBundle, loadTenantConfigBundleFromSource, TenantRuntime } from './tenant-config-loader';
import { normalizeHost, TenantResolutionError } from './tenant-config';

loadEnv();

declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantRuntime;
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('localhost'),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 4),
  TENANT_CONFIG_PATH: z.string().optional(),
  TENANT_CONFIG_JSON: z.string().optional(),
  DEFAULT_TENANT_ID: z.string().optional(),
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SESSION_TTL_SECONDS: process.env.SESSION_TTL_SECONDS,
  TENANT_CONFIG_PATH: process.env.TENANT_CONFIG_PATH,
  TENANT_CONFIG_JSON: process.env.TENANT_CONFIG_JSON,
  DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID,
});

const tenantBundle = loadTenantConfigBundleFromSource({
  path: env.TENANT_CONFIG_PATH,
  json: env.TENANT_CONFIG_JSON,
});
const runtimeBundle = buildTenantRuntimeBundle(tenantBundle);

const fallbackTenant: TenantRuntime | undefined = (() => {
  if (env.DEFAULT_TENANT_ID) {
    const defaultTenant = runtimeBundle.tenantsById.get(env.DEFAULT_TENANT_ID);
    if (!defaultTenant) {
      throw new Error(`DEFAULT_TENANT_ID ${env.DEFAULT_TENANT_ID} not found in tenant config bundle`);
    }
    return defaultTenant;
  }
  if (runtimeBundle.tenants.length === 1) {
    return runtimeBundle.tenants[0];
  }
  return undefined;
})();

function resolveTenantByHost(hostHeader?: string) {
  const normalizedHost = normalizeHost(hostHeader);
  if (!normalizedHost) {
    return undefined;
  }
  return runtimeBundle.tenantsByHost.get(normalizedHost);
}

function requireTenantForHost(hostHeader?: string): TenantRuntime {
  const tenant = resolveTenantByHost(hostHeader);
  if (tenant) {
    return tenant;
  }
  if (fallbackTenant) {
    return fallbackTenant;
  }
  throw new TenantResolutionError(`No tenant configured for host ${hostHeader ?? '<unknown>'}`);
}

function requireTenantById(tenantId: string): TenantRuntime {
  const tenant = runtimeBundle.tenantsById.get(tenantId);
  if (!tenant) {
    throw new TenantResolutionError(`No tenant configured with id ${tenantId}`);
  }
  return tenant;
}

function selectGoogleRedirectUrl(tenant: TenantRuntime, hostHeader?: string) {
  if (hostHeader) {
    const normalizedHost = normalizeHost(hostHeader);
    if (normalizedHost) {
      const match = tenant.googleRedirectHostMap.get(normalizedHost);
      if (match) {
        return match;
      }
    }
  }
  return tenant.googleRedirectUrls[0];
}

const allowedOriginsSet = runtimeBundle.allowedOrigins;
const isProduction = process.env.NODE_ENV === 'production';
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const SESSION_COOKIE = 'consumer_portal_session';
const STATE_TTL_MS = 5 * 60 * 1000;
const stateStore = new Map<string, { createdAt: number; tenantId: string }>();
const sessionSecret = new TextEncoder().encode(env.SESSION_SECRET);
const tenantConfigResponse = (tenant: TenantRuntime) => ({
  tenantId: tenant.tenantId,
  name: tenant.name,
  supportEmail: tenant.supportEmail,
  premiumDeployment: tenant.premiumDeployment,
  branding: tenant.branding,
  featureFlags: tenant.featureFlags,
  clientApp: {
    baseUrl: tenant.clientApp.baseUrl,
    landingPath: tenant.clientApp.landingPath,
  },
});

type SessionPayload = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  provider: 'google';
  tenantId: string;
};

function createStateToken(tenantId: string) {
  const value = randomBytes(16).toString('hex');
  stateStore.set(value, { createdAt: Date.now(), tenantId });
  return value;
}

function consumeStateTenantId(state?: string | null) {
  if (!state) {
    return undefined;
  }
  const entry = stateStore.get(state);
  stateStore.delete(state);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    return undefined;
  }
  return entry.tenantId;
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

async function callHeadless<T>(tenant: TenantRuntime, path: string, init?: RequestInit, actorRoles?: string): Promise<T> {
  const url = new URL(path, tenant.headless.baseUrl);
  const headers: HeadersInit = {
    'content-type': 'application/json',
    'x-api-key': tenant.headless.apiKey,
    'x-tenant-id': tenant.headless.tenantId,
    'x-actor-roles': actorRoles ?? tenant.headless.actorRoles.join(','),
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

export const app = Fastify({
  logger: true,
});

app.decorateRequest('tenant', null as unknown as TenantRuntime);

app.addHook('onRequest', (request, reply, done) => {
  try {
    const tenant = requireTenantForHost(request.headers.host);
    request.tenant = tenant;
    done();
  } catch (error) {
    if (error instanceof TenantResolutionError) {
      reply.code(404).send({ error: error.message });
      return;
    }
    done(error as Error);
  }
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
    if (allowedOriginsSet.size === 0 || allowedOriginsSet.has(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error('Origin not allowed'), false);
  },
  credentials: true,
});

app.get('/health', () => ({ status: 'ok' }));

app.get('/auth/google/login', async (request, reply) => {
  const tenant = request.tenant;
  const redirectTarget = selectGoogleRedirectUrl(tenant, request.headers.host);
  const state = createStateToken(tenant.tenantId);
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: tenant.auth.google.clientId,
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
  const tenantIdFromState = consumeStateTenantId(state);
  if (!code || !tenantIdFromState) {
    reply.code(400);
    return { error: 'Invalid OAuth state' };
  }
  const tenantFromState = requireTenantById(tenantIdFromState);
  const hostTenant = request.tenant;
  if (hostTenant && hostTenant.tenantId !== tenantFromState.tenantId) {
    reply.code(400);
    return { error: 'Tenant mismatch detected for OAuth callback' };
  }
  const tenant = tenantFromState;

  const redirectTarget = selectGoogleRedirectUrl(tenant, request.headers.host);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: tenant.auth.google.clientId,
      client_secret: tenant.auth.google.clientSecret,
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
    tenantId: tenant.tenantId,
  });
  reply
    .setCookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: env.SESSION_TTL_SECONDS,
    })
    .redirect(tenant.landingRedirectUrl);
});

app.get('/auth/session', async (request, reply) => {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    reply.code(401);
    return { error: 'Not authenticated' };
  }
  try {
    const { payload } = await verifySessionToken(token);
    const tenant = runtimeBundle.tenantsById.get(payload.tenantId);
    if (!tenant) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      reply.code(401);
      return { error: 'Tenant configuration unavailable' };
    }
    return {
      user: payload,
      tenant: tenantConfigResponse(tenant),
    };
  } catch {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.code(401);
    return { error: 'Invalid session' };
  }
});

app.get('/config', async (request, reply) => {
  const tenant = request.tenant;
  if (!tenant) {
    reply.code(404);
    return { error: 'Tenant not resolved' };
  }
  return tenantConfigResponse(tenant);
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
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/analytics/assessments/${assessmentId}`, undefined, actorRoles);
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
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/attempts', {
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
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/attempts/${attemptId}`, undefined, actorRoles);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

if (!isTestEnv) {
  app
    .listen({ port: env.PORT, host: env.HOST })
    .then(() => {
      app.log.info(`Consumer BFF listening on http://${env.HOST}:${env.PORT}`);
    })
    .catch(error => {
      app.log.error(error, 'Failed to start BFF');
      process.exit(1);
    });
}
