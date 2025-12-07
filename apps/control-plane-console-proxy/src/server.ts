import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { fetch } from 'undici';
import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from './env.js';
import {
  createInMemorySecurityStore,
  createSQLiteSecurityStore,
  type SecurityStore,
} from './storage/security-store.js';

const SESSION_COOKIE_NAME = 'cpc_session';
const OTP_LENGTH = 6;
const OTP_TTL_MS = env.OTP_TTL_SECONDS * 1000;
const SESSION_TTL_MS = env.SESSION_TTL_SECONDS * 1000;
const isProduction = process.env.NODE_ENV === 'production';
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

function hashOtp(otp: string, salt: string): string {
  return scryptSync(otp, salt, 32).toString('hex');
}

function safeCompare(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(actual, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function getRequestContext(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = forwardedValue?.split(',')[0]?.trim() || request.ip;
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
  return { ip, userAgent };
}

type ConsoleSession = {
  username: string;
  sessionId: string;
  expiresAt: number;
  roles: string[];
};

declare module 'fastify' {
  interface FastifyRequest {
    session?: ConsoleSession;
  }
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const verifySchema = z.object({
  challengeId: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/',
  maxAge: env.SESSION_TTL_SECONDS,
};

function createSecurityStoreFromProvider(): SecurityStore {
  switch (env.CONSOLE_DB_PROVIDER) {
    case 'memory':
      return createInMemorySecurityStore();
    case 'sqlite':
      return createSQLiteSecurityStore(env.CONSOLE_DB_PATH);
    case 'cosmos':
      throw new Error('Cosmos security store provider not implemented yet');
    default:
      throw new Error(`Unsupported CONSOLE_DB_PROVIDER: ${env.CONSOLE_DB_PROVIDER}`);
  }
}

function resolveConsoleRoles(username: string): string[] {
  const roles = new Set<string>();
  if (username === env.CONSOLE_BASIC_USER) {
    roles.add('SUPER_ADMIN');
  }
  return Array.from(roles);
}

async function requireSession(request: FastifyRequest, reply: FastifyReply, securityStore: SecurityStore) {
  try {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      throw new Error('Missing session cookie');
    }
    const payload = await request.jwtVerify<{ sub: string; sid: string; exp: number }>();
    const persisted = securityStore.findSession(payload.sid);
    if (!persisted) {
      throw new Error('Session not found');
    }
    if (persisted.revokedAt) {
      throw new Error('Session revoked');
    }
    const expiresAtMs = new Date(persisted.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      securityStore.revokeSession(persisted.id, new Date().toISOString());
      throw new Error('Session expired');
    }
    const resolvedRoles = resolveConsoleRoles(persisted.username);
    const session: ConsoleSession = {
      username: payload.sub,
      sessionId: payload.sid,
      expiresAt: expiresAtMs,
      roles: resolvedRoles,
    };
    request.session = session;
    return session;
  } catch (error) {
    request.log.warn({ err: error }, 'Unauthorized session');
    reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    if (!reply.sent) {
      reply.code(401).send({ message: 'Unauthorized' });
    }
    return null;
  }
}

export async function createServer(deps?: { securityStore?: SecurityStore }): Promise<FastifyInstance> {
  const securityStore = deps?.securityStore ?? createSecurityStoreFromProvider();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie);
  await app.register(fastifyJwt, {
    secret: env.CONSOLE_SESSION_SECRET,
    cookie: {
      cookieName: SESSION_COOKIE_NAME,
      signed: false,
    },
  });

  const maintenanceTimer = setInterval(() => {
    const nowIso = new Date().toISOString();
    securityStore.expirePendingChallenges(nowIso);
    securityStore.expireSessions(nowIso);
  }, OTP_TTL_MS).unref();

  const registerAuthRoutes = (prefix = '') => {
    app.post(`${prefix}/auth/login`, async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ message: 'Invalid login payload' });
      }

      const { username, password } = parsed.data;
      const { ip, userAgent } = getRequestContext(request);
      if (username !== env.CONSOLE_BASIC_USER || password !== env.CONSOLE_BASIC_PASS) {
        securityStore.appendAuditLog({
          actor: username,
          action: 'LOGIN_CREDENTIALS_REJECTED',
          metadata: { reason: 'invalid_credentials' },
          ip,
          userAgent,
        });
        return reply.code(401).send({ message: 'Invalid credentials' });
      }

      const challengeId = randomUUID();
      const otp = generateOtp();
      const salt = randomBytes(16).toString('hex');
      const expiresAtIso = new Date(Date.now() + OTP_TTL_MS).toISOString();
      securityStore.createOtpChallenge({
        id: challengeId,
        username,
        otpHash: hashOtp(otp, salt),
        salt,
        deliveryChannel: isProduction ? 'out-of-band' : 'dev-log',
        deliveryMetadata: isProduction ? undefined : 'local-dev',
        issuedAt: new Date().toISOString(),
        expiresAt: expiresAtIso,
        maxAttempts: env.OTP_MAX_ATTEMPTS,
      });
      securityStore.appendAuditLog({
        actor: username,
        action: 'LOGIN_CHALLENGE_CREATED',
        metadata: { challengeId, delivery: isProduction ? 'out-of-band' : 'dev-log' },
        ip,
        userAgent,
      });
      request.log.info({ challengeId }, 'Issued OTP challenge');

      return reply.send({
        challengeId,
        expiresAt: expiresAtIso,
        delivery: isProduction ? 'out-of-band' : 'log',
        devOtp: isProduction ? undefined : otp,
      });
    });

    app.post(`${prefix}/auth/verify`, async (request, reply) => {
      const parsed = verifySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ message: 'Invalid verification payload' });
      }

      const { ip, userAgent } = getRequestContext(request);
      const { challengeId, otp } = parsed.data;
      const challenge = securityStore.findOtpChallenge(challengeId);
      if (!challenge) {
        securityStore.appendAuditLog({
          action: 'OTP_VERIFY_FAILED',
          metadata: { challengeId, reason: 'not_found' },
          ip,
          userAgent,
        });
        return reply.code(400).send({ message: 'Challenge not found' });
      }

      if (challenge.status !== 'pending') {
        securityStore.appendAuditLog({
          actor: challenge.username,
          action: 'OTP_VERIFY_FAILED',
          metadata: { challengeId, reason: `challenge_${challenge.status}` },
          ip,
          userAgent,
        });
        return reply.code(400).send({ message: 'Challenge has already been resolved' });
      }

      const now = Date.now();
      if (new Date(challenge.expiresAt).getTime() <= now) {
        const nowIso = new Date().toISOString();
        securityStore.updateChallengeStatus(challenge.id, 'expired', nowIso);
        securityStore.appendAuditLog({
          actor: challenge.username,
          action: 'OTP_EXPIRED',
          metadata: { challengeId },
          ip,
          userAgent,
        });
        return reply.code(401).send({ message: 'OTP expired' });
      }

      if (challenge.attempts >= challenge.maxAttempts) {
        securityStore.updateChallengeStatus(challenge.id, 'locked', new Date().toISOString());
        securityStore.appendAuditLog({
          actor: challenge.username,
          action: 'OTP_LOCKED',
          metadata: { challengeId },
          ip,
          userAgent,
        });
        return reply.code(429).send({ message: 'Too many attempts' });
      }

      const expectedHash = hashOtp(otp, challenge.salt);
      const isValid = safeCompare(expectedHash, challenge.otpHash);
      if (!isValid) {
        const attempts = securityStore.incrementOtpAttempts(challenge.id);
        const locked = attempts >= challenge.maxAttempts;
        if (locked) {
          securityStore.updateChallengeStatus(challenge.id, 'locked', new Date().toISOString());
        }
        securityStore.appendAuditLog({
          actor: challenge.username,
          action: 'OTP_VERIFY_FAILED',
          metadata: { challengeId, attempts, reason: 'invalid_code' },
          ip,
          userAgent,
        });
        if (locked) {
          return reply.code(429).send({ message: 'Too many attempts' });
        }
        return reply.code(401).send({ message: 'Invalid OTP' });
      }

      const verifiedAt = new Date().toISOString();
      securityStore.updateChallengeStatus(challenge.id, 'verified', verifiedAt);
      const sessionId = randomUUID();
      const expiresAtIso = new Date(now + SESSION_TTL_MS).toISOString();
      const resolvedRoles = resolveConsoleRoles(challenge.username);
      securityStore.createSession({
        id: sessionId,
        username: challenge.username,
        issuedAt: verifiedAt,
        expiresAt: expiresAtIso,
        ip,
        userAgent,
      });
      securityStore.appendAuditLog({
        actor: challenge.username,
        action: 'OTP_VERIFIED',
        metadata: { challengeId },
        ip,
        userAgent,
      });
      securityStore.appendAuditLog({
        actor: challenge.username,
        action: 'SESSION_ISSUED',
        metadata: { sessionId, expiresAt: expiresAtIso },
        ip,
        userAgent,
      });
      const token = await reply.jwtSign(
        { sub: challenge.username, sid: sessionId },
        { expiresIn: `${env.SESSION_TTL_SECONDS}s` },
      );
      reply.setCookie(SESSION_COOKIE_NAME, token, cookieOptions);

      return reply.send({
        actor: { username: challenge.username, roles: resolvedRoles },
        expiresAt: expiresAtIso,
      });
    });

    app.post(`${prefix}/auth/logout`, async (request, reply) => {
      const session = await requireSession(request, reply, securityStore);
      if (!session) {
        return;
      }
      reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
      const { ip, userAgent } = getRequestContext(request);
      securityStore.revokeSession(session.sessionId, new Date().toISOString());
      securityStore.appendAuditLog({
        actor: session.username,
        action: 'SESSION_REVOKED',
        metadata: { sessionId: session.sessionId },
        ip,
        userAgent,
      });
      request.log.info({ sessionId: session.sessionId }, 'Console session terminated');
      reply.send({ success: true });
    });

    app.get(`${prefix}/auth/session`, async (request, reply) => {
      const session = await requireSession(request, reply, securityStore);
      if (!session) {
        return;
      }
      return reply.send({
        actor: { username: session.username, roles: session.roles },
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    });
  };

  registerAuthRoutes();
  registerAuthRoutes('/api');

  app.get('/audit/logs', async (request, reply) => {
    const session = await requireSession(request, reply, securityStore);
    if (!session) {
      return;
    }
    const parsed = auditQuerySchema.safeParse(request.query ?? {});
    const limit = parsed.success ? parsed.data.limit ?? 50 : 50;
    const logs = securityStore.listAuditLogs(limit);
    return reply.send({ logs });
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.all('/api/*', async (request, reply) => {
    const session = await requireSession(request, reply, securityStore);
    if (!session) {
      return;
    }

    const params = request.params as { '*': string | undefined };
    const wildcardPath = params?.['*'] ?? '';
    const upstreamUrl = new URL(wildcardPath, env.CONTROL_PLANE_BASE_URL).toString();
    const method = request.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';

    let body: string | Buffer | undefined;
    if (hasBody && request.body !== undefined && request.body !== null) {
      if (Buffer.isBuffer(request.body)) {
        body = request.body;
      } else if (typeof request.body === 'string') {
        body = request.body;
      } else {
        body = JSON.stringify(request.body);
      }
    }

    const sanitizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (!value) continue;
      if (key === 'host' || key === 'authorization' || key === 'content-length' || key === 'cookie') continue;
      sanitizedHeaders[key] = Array.isArray(value) ? value.join(',') : String(value);
    }
    sanitizedHeaders['x-control-plane-key'] = env.CONTROL_PLANE_API_KEY;
    // Forward the authenticated console actor to the control plane API so audit metadata
    // (updatedBy) can reflect who performed an action.
    if (session && session.username) {
      sanitizedHeaders['x-control-plane-actor'] = session.username;
      if (session.roles?.length) {
        sanitizedHeaders['x-control-plane-roles'] = session.roles.join(',');
      }
    }

    const upstream = await fetch(upstreamUrl, {
      method,
      headers: sanitizedHeaders,
      body,
    });

    reply.code(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') {
        return;
      }
      reply.header(key, value);
    });

    if (upstream.body) {
      return reply.send(upstream.body);
    }
    return reply.send();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled error');
    if (!reply.sent) {
      reply.code(500).send({ message: 'Proxy error' });
    }
  });

  app.addHook('onClose', async () => {
    clearInterval(maintenanceTimer);
  });

  return app;
}

if (!isTestEnv) {
  const start = async () => {
    const app = await createServer();
    app
      .listen({ port: env.PORT, host: env.HOST })
      .then(() => {
        app.log.info(`Control Plane Console Proxy listening on http://${env.HOST}:${env.PORT}`);
      })
      .catch((error) => {
        app.log.error(error, 'Failed to start server');
        process.exit(1);
      });
  };

  void start();
}
