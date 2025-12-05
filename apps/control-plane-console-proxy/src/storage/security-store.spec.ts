import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInMemorySecurityStore, createSQLiteSecurityStore } from './security-store.js';

type ChallengeInput = {
  id: string;
  username: string;
  issuedAt: string;
  expiresAt: string;
};

function buildChallenge(input?: Partial<ChallengeInput>) {
  const now = Date.now();
  return {
    id: input?.id ?? 'challenge-1',
    username: input?.username ?? 'alice',
    issuedAt: input?.issuedAt ?? new Date(now).toISOString(),
    expiresAt: input?.expiresAt ?? new Date(now + 60_000).toISOString(),
  };
}

describe('In-memory security store', () => {
  const store = createInMemorySecurityStore();

  it('creates and retrieves OTP challenges', () => {
    const challenge = buildChallenge();
    store.createOtpChallenge({
      ...challenge,
      otpHash: 'hash',
      salt: 'salt',
      deliveryChannel: 'dev-log',
      maxAttempts: 3,
    });

    const found = store.findOtpChallenge(challenge.id);
    expect(found).toBeTruthy();
    expect(found?.status).toBe('pending');
    expect(found?.attempts).toBe(0);
  });

  it('increments attempts and locks on update', () => {
    const challenge = buildChallenge({ id: 'challenge-attempts' });
    store.createOtpChallenge({
      ...challenge,
      otpHash: 'hash',
      salt: 'salt',
      deliveryChannel: 'dev-log',
      maxAttempts: 2,
    });

    expect(store.incrementOtpAttempts(challenge.id)).toBe(1);
    expect(store.incrementOtpAttempts(challenge.id)).toBe(2);
    store.updateChallengeStatus(challenge.id, 'locked', new Date().toISOString());
    const locked = store.findOtpChallenge(challenge.id);
    expect(locked?.status).toBe('locked');
  });

  it('expires pending challenges based on timestamp', () => {
    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    const challenge = buildChallenge({ id: 'challenge-expire', expiresAt: expiredAt });
    store.createOtpChallenge({
      ...challenge,
      otpHash: 'hash',
      salt: 'salt',
      deliveryChannel: 'dev-log',
      maxAttempts: 1,
    });

    store.expirePendingChallenges(new Date().toISOString());
    expect(store.findOtpChallenge(challenge.id)?.status).toBe('expired');
  });

  it('creates, finds, and revokes sessions', () => {
    const now = Date.now();
    store.createSession({
      id: 'session-1',
      username: 'alice',
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5_000).toISOString(),
    });
    expect(store.findSession('session-1')?.username).toBe('alice');

    store.revokeSession('session-1', new Date().toISOString());
    expect(store.findSession('session-1')?.revokedAt).toBeTruthy();
  });

  it('expires sessions when past expiry', () => {
    const expired = new Date(Date.now() - 2_000).toISOString();
    store.createSession({
      id: 'session-expired',
      username: 'bob',
      issuedAt: expired,
      expiresAt: expired,
    });
    store.expireSessions(new Date().toISOString());
    expect(store.findSession('session-expired')?.revokedAt).toBeTruthy();
  });

  it('stores and trims audit logs with ordering', () => {
    store.appendAuditLog({ action: 'FIRST', createdAt: '2024-01-01T00:00:00.000Z' });
    store.appendAuditLog({ action: 'SECOND', createdAt: '2024-01-02T00:00:00.000Z' });
    const [latest] = store.listAuditLogs(1);
    expect(latest.action).toBe('SECOND');
  });
});

describe('SQLite security store', () => {
  const tmpDb = path.join(tmpdir(), `console-proxy-${Date.now()}.db`);
  let store = createSQLiteSecurityStore(tmpDb);

  beforeEach(() => {
    store = createSQLiteSecurityStore(tmpDb);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDb)) {
      fs.rmSync(tmpDb, { force: true });
    }
  });

  it('persists OTP challenges and attempts', () => {
    const challenge = buildChallenge({ id: 'sqlite-challenge' });
    store.createOtpChallenge({
      ...challenge,
      otpHash: 'hash',
      salt: 'salt',
      deliveryChannel: 'dev-log',
      maxAttempts: 2,
    });
    expect(store.findOtpChallenge('sqlite-challenge')?.status).toBe('pending');
    expect(store.incrementOtpAttempts('sqlite-challenge')).toBe(1);
  });

  it('persists sessions and expiration', () => {
    const now = Date.now();
    const expiresAt = new Date(now + 1_000).toISOString();
    store.createSession({
      id: 'sqlite-session',
      username: 'carol',
      issuedAt: new Date(now).toISOString(),
      expiresAt,
    });

    expect(store.findSession('sqlite-session')?.username).toBe('carol');
    store.expireSessions(new Date(Date.now() + 5_000).toISOString());
    expect(store.findSession('sqlite-session')?.revokedAt).toBeTruthy();
  });

  it('returns ordered audit logs with limits', () => {
    store.appendAuditLog({ action: 'A', createdAt: '2024-01-01T00:00:00.000Z' });
    store.appendAuditLog({ action: 'B', createdAt: '2024-01-02T00:00:00.000Z' });
    const logs = store.listAuditLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('B');
  });
});
