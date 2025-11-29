import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, TenantError } from '../../../common/errors.js';

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock('../api-key.store.js', () => ({
  apiKeyStore: {
    get: getMock,
  },
}));

// Import after mocking so the middleware uses the mocked store
import { registerAuth } from '../auth.middleware.js';

function createRequest(headers: Record<string, string | undefined> = {}) {
  return {
    headers,
    log: {
      error: vi.fn(),
    },
  } as any;
}

function createReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
  };
  return reply as any;
}

describe('registerAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when API key header is missing', async () => {
    const req = createRequest({});
    const reply = createReply();

    await expect(registerAuth(req, reply)).rejects.toBeInstanceOf(AuthError);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('rejects when API key is invalid', async () => {
    getMock.mockResolvedValueOnce(undefined);
    const req = createRequest({ 'x-api-key': 'bad-key' });
    const reply = createReply();

    await expect(registerAuth(req, reply)).rejects.toBeInstanceOf(AuthError);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(getMock).toHaveBeenCalledWith('bad-key');
  });

  it('rejects when tenant header is missing', async () => {
    getMock.mockResolvedValueOnce({ key: 'good', tenantId: 'tenant-1' });
    const req = createRequest({ 'x-api-key': 'good' });
    const reply = createReply();

    await expect(registerAuth(req, reply)).rejects.toBeInstanceOf(TenantError);
    expect(reply.code).toHaveBeenCalledWith(400);
  });

  it('rejects when tenant mismatch occurs', async () => {
    getMock.mockResolvedValueOnce({ key: 'good', tenantId: 'tenant-1' });
    const req = createRequest({ 'x-api-key': 'good', 'x-tenant-id': 'tenant-2' });
    const reply = createReply();

    await expect(registerAuth(req, reply)).rejects.toBeInstanceOf(TenantError);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('propagates errors from the API key store as service unavailable', async () => {
    const error = new Error('boom');
    getMock.mockRejectedValueOnce(error);
    const req = createRequest({ 'x-api-key': 'good', 'x-tenant-id': 'tenant-1' });
    const reply = createReply();

    await expect(registerAuth(req, reply)).rejects.toBeInstanceOf(AuthError);
    expect(reply.code).toHaveBeenCalledWith(503);
    const log = req.log.error as ReturnType<typeof vi.fn>;
    expect(log).toHaveBeenCalled();
  });

  it('passes when API key and tenant match', async () => {
    getMock.mockResolvedValueOnce({ key: 'good', tenantId: 'tenant-1' });
    const req = createRequest({ 'x-api-key': 'good', 'x-tenant-id': 'tenant-1' });
    const reply = createReply();

    await expect(registerAuth(req, reply)).resolves.toBeUndefined();
    expect(reply.code).not.toHaveBeenCalled();
    expect((req as any).tenantId).toBe('tenant-1');
    expect((req as any).actorTenantId).toBe('tenant-1');
    expect((req as any).isSuperAdmin).toBe(false);
  });

  it('allows super admin to impersonate any tenant', async () => {
    getMock.mockResolvedValueOnce({ key: 'sys-admin-key', tenantId: 'sys-tenant' });
    const req = createRequest({ 'x-api-key': 'sys-admin-key', 'x-tenant-id': 'tenant-123' });
    const reply = createReply();

    await expect(registerAuth(req, reply)).resolves.toBeUndefined();
    expect(reply.code).not.toHaveBeenCalled();
    expect((req as any).tenantId).toBe('tenant-123');
    expect((req as any).actorTenantId).toBe('sys-tenant');
    expect((req as any).isSuperAdmin).toBe(true);
  });
});
