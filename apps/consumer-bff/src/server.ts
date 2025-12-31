
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { buildTenantRuntimeBundle, loadTenantConfigBundleFromSource, TenantRuntime, TenantRuntimeBundle } from './tenant-config-loader';
import { normalizeHost, TenantResolutionError } from './tenant-config';

loadEnv();

declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantRuntime;
  }
}

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    HOST: z.string().default('localhost'),
    SESSION_SECRET: z.string().min(32),
    SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 4),
    TENANT_CONFIG_PATH: z.string().optional(),
    TENANT_CONFIG_JSON: z.string().optional(),
    DEFAULT_TENANT_ID: z.string().optional(),
    CONTROL_PLANE_BASE_URL: z.string().url().optional(),
    CONTROL_PLANE_API_KEY: z.string().min(32).optional(),
    CONTROL_PLANE_BUNDLE_PATH: z.string().optional().default('control/tenant-bundle'),
    TENANT_CONFIG_REFRESH_MS: z.coerce.number().min(5000).default(60000),
  })
  .superRefine((value, ctx) => {
    const usesControlPlane = Boolean(value.CONTROL_PLANE_BASE_URL || value.CONTROL_PLANE_API_KEY);
    if (usesControlPlane) {
      if (!value.CONTROL_PLANE_BASE_URL) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CONTROL_PLANE_BASE_URL is required when enabling control plane sync' });
      }
      if (!value.CONTROL_PLANE_API_KEY) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CONTROL_PLANE_API_KEY is required when enabling control plane sync' });
      }
      return;
    }
    if (!value.TENANT_CONFIG_PATH && !value.TENANT_CONFIG_JSON) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide TENANT_CONFIG_PATH or TENANT_CONFIG_JSON when control plane sync is disabled' });
    }
  });

const env = envSchema.parse({
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SESSION_TTL_SECONDS: process.env.SESSION_TTL_SECONDS,
  TENANT_CONFIG_PATH: process.env.TENANT_CONFIG_PATH,
  TENANT_CONFIG_JSON: process.env.TENANT_CONFIG_JSON,
  DEFAULT_TENANT_ID: process.env.DEFAULT_TENANT_ID,
  CONTROL_PLANE_BASE_URL: process.env.CONTROL_PLANE_BASE_URL,
  CONTROL_PLANE_API_KEY: process.env.CONTROL_PLANE_API_KEY,
  CONTROL_PLANE_BUNDLE_PATH: process.env.CONTROL_PLANE_BUNDLE_PATH,
  TENANT_CONFIG_REFRESH_MS: process.env.TENANT_CONFIG_REFRESH_MS,
});

const controlPlaneSource = env.CONTROL_PLANE_BASE_URL
  ? {
      baseUrl: env.CONTROL_PLANE_BASE_URL,
      apiKey: env.CONTROL_PLANE_API_KEY as string,
      path: env.CONTROL_PLANE_BUNDLE_PATH,
    }
  : undefined;

const tenantConfigSource = {
  path: env.TENANT_CONFIG_PATH,
  json: env.TENANT_CONFIG_JSON,
  controlPlane: controlPlaneSource,
};

const tenantBundle = await loadTenantConfigBundleFromSource(tenantConfigSource);
let runtimeBundle: TenantRuntimeBundle = buildTenantRuntimeBundle(tenantBundle);

function computeFallbackTenant(bundle: TenantRuntimeBundle): TenantRuntime | undefined {
  if (env.DEFAULT_TENANT_ID) {
    const defaultTenant = bundle.tenantsById.get(env.DEFAULT_TENANT_ID);
    if (!defaultTenant) {
      throw new Error(`DEFAULT_TENANT_ID ${env.DEFAULT_TENANT_ID} not found in tenant config bundle`);
    }
    return defaultTenant;
  }
  if (bundle.tenants.length === 1) {
    return bundle.tenants[0];
  }
  return undefined;
}

let fallbackTenant = computeFallbackTenant(runtimeBundle);

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

const isProduction = process.env.NODE_ENV === 'production';
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const SESSION_COOKIE = 'consumer_portal_session';
const STATE_TTL_MS = 5 * 60 * 1000;
const stateStore = new Map<string, { createdAt: number; tenantId: string }>();
const sessionSecret = new TextEncoder().encode(env.SESSION_SECRET);
const tenantConfigResponse = (tenant: TenantRuntime) => ({
  tenantId: tenant.tenantId,
  headlessTenantId: tenant.headless.tenantId,
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

async function callHeadless<T>(tenant: TenantRuntime, path: string, reply: FastifyReply, init?: RequestInit, request?: FastifyRequest): Promise<T> {
  const actorRoles = (request?.headers['x-actor-roles'] as string | undefined)?.trim();
  const actorId = (request?.headers['x-actor-id'] as string | undefined)?.trim();
  const url = new URL(path, tenant.headless.baseUrl);
  const headers: Record<string, string> = {
    'x-api-key': tenant.headless.apiKey,
    'x-tenant-id': tenant.headless.tenantId,
    'x-actor-roles': actorRoles ?? tenant.headless.actorRoles.join(','),
    'x-actor-id': actorId ?? '',
    ...(init?.headers as Record<string, string> ?? {}),
  };
  // Only set content-type for requests with a body
  if (init?.body) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : (payload as { error?: string }).error ?? 'Headless API error';
    if (request && request.log) {
      request.log.error({
        err: new HeadlessRequestError(message, response.status),
        status: response.status,
        url: url.toString(),
        payload
      }, 'HeadlessRequestError in callHeadless');
    }
    throw new HeadlessRequestError(message, response.status);
  }
  reply.code(response.status);
  return payload as T;
}

export const app = Fastify({
  logger: true,
});

async function refreshTenantRuntimeBundle(reason: string) {
  const rawBundle = await loadTenantConfigBundleFromSource(tenantConfigSource);
  if (rawBundle.updatedAt === runtimeBundle.raw.updatedAt) {
    return;
  }
  const nextRuntime = buildTenantRuntimeBundle(rawBundle);
  let nextFallback: TenantRuntime | undefined;
  try {
    nextFallback = computeFallbackTenant(nextRuntime);
  } catch (error) {
    app.log.error({ err: error, reason }, 'Failed to compute fallback tenant for refreshed bundle');
    return;
  }
  runtimeBundle = nextRuntime;
  fallbackTenant = nextFallback;
  app.log.info({ updatedAt: runtimeBundle.raw.updatedAt, reason }, 'Tenant bundle refreshed from control plane');
}

let refreshTimer: NodeJS.Timeout | undefined;
if (controlPlaneSource && !isTestEnv) {
  refreshTimer = setInterval(() => {
    refreshTenantRuntimeBundle('interval').catch(error => {
      app.log.error({ err: error }, 'Failed to refresh tenant bundle from control plane');
    });
  }, env.TENANT_CONFIG_REFRESH_MS);
  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }
}

if (refreshTimer) {
  app.addHook('onClose', async () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  });
}


app.decorateRequest('tenant', null as unknown as TenantRuntime);

// Register assessment overview route after app is defined
app.get('/api/assessments/overview', async (request, reply) => {
  const tenant = request.tenant;
  try {
    // Fetch all assessments
    const assessments = await callHeadless<any[]>(tenant, '/assessments', reply, undefined, request);
    // Fetch all cohorts
    const cohorts = await callHeadless<any[]>(tenant, '/cohorts', reply, undefined, request);
    // Map assessmentId to cohort count
    const assessmentIdToCohortCount: Record<string, number> = {};
    for (const cohort of cohorts) {
      if (Array.isArray(cohort.assignments)) {
        for (const assignment of cohort.assignments) {
          if (!assessmentIdToCohortCount[assignment.assessmentId]) {
            assessmentIdToCohortCount[assignment.assessmentId] = 0;
          }
          assessmentIdToCohortCount[assignment.assessmentId]++;
        }
      } else if (Array.isArray(cohort.assessmentIds)) {
        for (const id of cohort.assessmentIds) {
          if (!assessmentIdToCohortCount[id]) {
            assessmentIdToCohortCount[id] = 0;
          }
          assessmentIdToCohortCount[id]++;
        }
      }
    }
    // Compose overview
    const overview = {
      total: Array.isArray(assessments) ? assessments.length : 0,
      assessments: Array.isArray(assessments)
        ? assessments.map(a => ({
            id: a.id,
            title: a.title,
            status: a.status || 'draft',
            itemCount: Array.isArray(a.itemIds) ? a.itemIds.length : 0,
            cohortCount: assessmentIdToCohortCount[a.id] || 0,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          }))
        : [],
    };
    return overview;
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

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
    const allowedOrigins = runtimeBundle.allowedOrigins;
    if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
      cb(null, true);
      return;
    }
    // Allow common dev ports for localhost to avoid flip-flopping
    if (origin === 'http://localhost:5174' || origin === 'http://localhost:5175') {
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

  // Look up user in headless API to get their UUID if they exist
  let headlessUserId = profile.sub;
  try {
    const headlessUser = await callHeadless<{ id: string }>(tenant, `/users/by-email/${profile.email}`, reply);
    if (headlessUser && headlessUser.id) {
      headlessUserId = headlessUser.id;
    }
  } catch (err) {
    // If not found or error, fallback to Google sub
    request.log.info({ email: profile.email }, 'User not found in headless API, falling back to Google sub');
  }

  const sessionToken = await createSessionToken({
    sub: headlessUserId,
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
  try {
    const taxonomy = await callHeadless(tenant, '/config/taxonomy', reply, {
      headers: { 'x-actor-roles': 'TENANT_ADMIN' }
    }, request);
    const config = tenantConfigResponse(tenant) as any;
    config.taxonomy = taxonomy;
    return config;
  } catch (error) {
    // If taxonomy fetch fails, return config without taxonomy
    return tenantConfigResponse(tenant);
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
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/analytics/assessments/${assessmentId}`, reply, undefined, request);
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
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/attempts', reply, {
      method: 'POST',
      body: JSON.stringify(parsed.data),
    }, request);
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
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/attempts/${attemptId}`, reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.patch('/api/attempts/:id/responses', async (request, reply) => {
  const attemptId = (request.params as { id: string }).id;
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/attempts/${attemptId}/responses`, reply, {
      method: 'PATCH',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.post('/api/attempts/:id/submit', async (request, reply) => {
  const attemptId = (request.params as { id: string }).id;
  const tenant = request.tenant;
  try {
    const init: RequestInit = { method: 'POST' };
    if (request.body) {
      init.body = JSON.stringify(request.body);
    }
    return await callHeadless(tenant, `/attempts/${attemptId}/submit`, reply, init, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/attempts/:id/items', async (request, reply) => {
  const attemptId = (request.params as { id: string }).id;
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/attempts/${attemptId}/items`, reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/items', async (request, reply) => {
  const tenant = request.tenant;
  const query = request.query as Record<string, string>;
  const searchParams = new URLSearchParams(query);
  try {
    return await callHeadless(tenant, `/items?${searchParams.toString()}`, reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/assessments', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/assessments', reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.post('/api/assessments', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/assessments', reply, {
      method: 'POST',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/assessments/:id', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/assessments/${id}`, reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.put('/api/assessments/:id', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/assessments/${id}`, reply, {
      method: 'PUT',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/users', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/users', reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.post('/api/users', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/users', reply, {
      method: 'POST',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/users/roles', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/users/roles', reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/users/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/users/${id}`, reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.put('/api/users/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/users/${id}`, reply, {
      method: 'PUT',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.delete('/api/users/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/users/${id}`, reply, {
      method: 'DELETE',
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.post('/api/cohorts/assignments/users/:userId', async (request, reply) => {
  const { userId } = request.params as { userId: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/cohorts/assignments/users/${userId}`, reply, {
      method: 'POST',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/cohorts', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/cohorts', reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.post('/api/cohorts', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/cohorts', reply, {
      method: 'POST',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.put('/api/cohorts/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/cohorts/${id}`, reply, {
      method: 'PUT',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.delete('/api/cohorts/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/cohorts/${id}`, reply, {
      method: 'DELETE',
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/cohorts/learner/:userId', async (request, reply) => {
  const { userId } = request.params as { userId: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/cohorts/learner/${userId}`, reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/attempts/user/:userId', async (request, reply) => {
  const { userId } = request.params as { userId: string };
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/attempts/user/${userId}`, reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});
app.post('/api/cohorts/:id/assessments', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/cohorts/${id}/assessments`, reply, {
      method: 'POST',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.post('/api/items', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/items', reply, {
      method: 'POST',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    request.log.error({ err: error }, 'Error in POST /api/items');
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    reply.code(500);
    return { error: error instanceof Error ? error.message : String(error) };
  }
});

app.put('/api/items/:id', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, `/items/${id}`, reply, {
      method: 'PUT',
      body: JSON.stringify(request.body),
    }, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.get('/api/config/taxonomy', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/config/taxonomy', reply, undefined, request);
  } catch (error) {
    if (error instanceof HeadlessRequestError) {
      reply.code(error.statusCode);
      return { error: error.message };
    }
    throw error;
  }
});

app.put('/api/config/taxonomy', async (request, reply) => {
  const tenant = request.tenant;
  try {
    return await callHeadless(tenant, '/config/taxonomy', reply, {
      method: 'PUT',
      body: JSON.stringify(request.body),
    }, request);
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
