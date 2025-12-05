import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fetch } from 'undici';
import { env } from './env.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

app.addHook('preHandler', async (request, reply) => {
  if (request.routerPath === '/healthz') {
    return;
  }

  const header = request.headers.authorization;
  if (!header?.startsWith('Basic ')) {
    reply.header('www-authenticate', 'Basic realm="control-plane-console"');
    return reply.code(401).send({ message: 'Missing auth header' });
  }

  const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    reply.header('www-authenticate', 'Basic realm="control-plane-console"');
    return reply.code(401).send({ message: 'Invalid credentials' });
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (username !== env.CONSOLE_BASIC_USER || password !== env.CONSOLE_BASIC_PASS) {
    reply.header('www-authenticate', 'Basic realm="control-plane-console"');
    return reply.code(401).send({ message: 'Invalid credentials' });
  }
});

app.get('/healthz', async () => ({ status: 'ok' }));

app.all('/api/*', async (request, reply) => {
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
    if (key === 'host' || key === 'authorization' || key === 'content-length') continue;
    sanitizedHeaders[key] = Array.isArray(value) ? value.join(',') : String(value);
  }
  sanitizedHeaders['x-control-plane-key'] = env.CONTROL_PLANE_API_KEY;

  const upstream = await fetch(upstreamUrl, {
    method,
    headers: sanitizedHeaders,
    body,
  });

  reply.code(upstream.status);
  upstream.headers.forEach((value, key) => {
    // Avoid overriding Fastify's automatic headers like transfer-encoding.
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

app.listen({ port: env.PORT, host: env.HOST }).catch((error) => {
  app.log.error(error, 'Failed to start server');
  process.exit(1);
});
