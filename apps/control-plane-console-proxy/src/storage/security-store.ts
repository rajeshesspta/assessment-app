import { randomUUID } from 'node:crypto';
import { createSqliteDatabase } from './sqlite.js';

export type ChallengeStatus = 'pending' | 'verified' | 'expired' | 'locked';

export interface OtpChallengeRecord {
  id: string;
  username: string;
  attempts: number;
  maxAttempts: number;
  status: ChallengeStatus;
  issuedAt: string;
  expiresAt: string;
  deliveryChannel: string;
  deliveryMetadata?: string | null;
  salt: string;
  otpHash: string;
  consumedAt?: string | null;
}

export interface SessionRecord {
  id: string;
  username: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditLogRecord {
  id: string;
  actor?: string | null;
  action: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface SecurityStore {
  createOtpChallenge(input: CreateOtpChallengeInput): void;
  findOtpChallenge(id: string): OtpChallengeRecord | undefined;
  incrementOtpAttempts(id: string): number;
  updateChallengeStatus(id: string, status: ChallengeStatus, consumedAt?: string): void;
  expirePendingChallenges(nowIso: string): void;
  createSession(input: CreateSessionInput): void;
  findSession(id: string): SessionRecord | undefined;
  revokeSession(id: string, revokedAt: string): void;
  expireSessions(nowIso: string): void;
  appendAuditLog(entry: AuditEntryInput): void;
  listAuditLogs(limit: number): AuditLogRecord[];
}

export interface CreateOtpChallengeInput {
  id: string;
  username: string;
  otpHash: string;
  salt: string;
  deliveryChannel: string;
  deliveryMetadata?: string;
  issuedAt: string;
  expiresAt: string;
  maxAttempts: number;
}

export interface CreateSessionInput {
  id: string;
  username: string;
  issuedAt: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditEntryInput {
  actor?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt?: string;
}

export function createSQLiteSecurityStore(dbPath: string): SecurityStore {
  const db = createSqliteDatabase(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS proxy_otp_challenges (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      delivery_channel TEXT NOT NULL,
      delivery_metadata TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proxy_otp_challenges_status ON proxy_otp_challenges(status);
    CREATE INDEX IF NOT EXISTS idx_proxy_otp_challenges_expires ON proxy_otp_challenges(expires_at);

    CREATE TABLE IF NOT EXISTS proxy_sessions (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proxy_sessions_active ON proxy_sessions(username, revoked_at);

    CREATE TABLE IF NOT EXISTS proxy_audit_logs (
      id TEXT PRIMARY KEY,
      actor TEXT,
      action TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proxy_audit_logs_created ON proxy_audit_logs(created_at DESC);
  `);

  function createOtpChallenge(input: CreateOtpChallengeInput) {
    db.prepare(`
      INSERT INTO proxy_otp_challenges (
        id, username, otp_hash, salt, delivery_channel, delivery_metadata,
        attempts, max_attempts, status, issued_at, expires_at
      ) VALUES (
        @id, @username, @otpHash, @salt, @deliveryChannel, @deliveryMetadata,
        0, @maxAttempts, 'pending', @issuedAt, @expiresAt
      )
    `).run({
      id: input.id,
      username: input.username,
      otpHash: input.otpHash,
      salt: input.salt,
      deliveryChannel: input.deliveryChannel,
      deliveryMetadata: input.deliveryMetadata ?? null,
      maxAttempts: input.maxAttempts,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });
  }

  function mapChallenge(row: any): OtpChallengeRecord | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      username: row.username,
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? 0),
      status: row.status as ChallengeStatus,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      deliveryChannel: row.delivery_channel,
      deliveryMetadata: row.delivery_metadata ?? null,
      salt: row.salt,
      otpHash: row.otp_hash,
      consumedAt: row.consumed_at ?? null,
    };
  }

  function findOtpChallenge(id: string): OtpChallengeRecord | undefined {
    const row = db.prepare('SELECT * FROM proxy_otp_challenges WHERE id = @id').get({ id });
    return mapChallenge(row);
  }

  function incrementOtpAttempts(id: string): number {
    db.prepare('UPDATE proxy_otp_challenges SET attempts = attempts + 1 WHERE id = @id').run({ id });
    const row = db.prepare('SELECT attempts FROM proxy_otp_challenges WHERE id = @id').get({ id });
    return Number(row?.attempts ?? 0);
  }

  function updateChallengeStatus(id: string, status: ChallengeStatus, consumedAt?: string) {
    db.prepare(
      'UPDATE proxy_otp_challenges SET status = @status, consumed_at = COALESCE(@consumedAt, consumed_at) WHERE id = @id',
    ).run({ id, status, consumedAt: consumedAt ?? null });
  }

  function expirePendingChallenges(nowIso: string) {
    db.prepare(
      "UPDATE proxy_otp_challenges SET status = 'expired', consumed_at = COALESCE(consumed_at, @now) WHERE status = 'pending' AND expires_at <= @now",
    ).run({ now: nowIso });
  }

  function createSession(input: CreateSessionInput) {
    db.prepare(
      `INSERT INTO proxy_sessions (id, username, issued_at, expires_at, ip, user_agent)
       VALUES (@id, @username, @issuedAt, @expiresAt, @ip, @userAgent)`,
    ).run({
      id: input.id,
      username: input.username,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  function mapSession(row: any): SessionRecord | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      username: row.username,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? null,
      ip: row.ip ?? null,
      userAgent: row.user_agent ?? null,
    };
  }

  function findSession(id: string): SessionRecord | undefined {
    const row = db.prepare('SELECT * FROM proxy_sessions WHERE id = @id').get({ id });
    return mapSession(row);
  }

  function revokeSession(id: string, revokedAt: string) {
    db.prepare('UPDATE proxy_sessions SET revoked_at = @revokedAt WHERE id = @id').run({ id, revokedAt });
  }

  function expireSessions(nowIso: string) {
    db.prepare(
      'UPDATE proxy_sessions SET revoked_at = COALESCE(revoked_at, @now) WHERE revoked_at IS NULL AND expires_at <= @now',
    ).run({ now: nowIso });
  }

  function appendAuditLog(entry: AuditEntryInput) {
    const createdAt = entry.createdAt ?? new Date().toISOString();
    db.prepare(
      `INSERT INTO proxy_audit_logs (id, actor, action, metadata_json, created_at, ip, user_agent)
       VALUES (@id, @actor, @action, @metadataJson, @createdAt, @ip, @userAgent)`,
    ).run({
      id: randomUUID(),
      actor: entry.actor ?? null,
      action: entry.action,
      metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
      createdAt,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
  }

  function listAuditLogs(limit: number): AuditLogRecord[] {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50;
    const rows = db
      .prepare('SELECT * FROM proxy_audit_logs ORDER BY datetime(created_at) DESC LIMIT @limit')
      .all({ limit: safeLimit });
    return rows.map((row: any) => ({
      id: row.id,
      actor: row.actor ?? null,
      action: row.action,
      metadata: row.metadata_json ? safeParseJson(row.metadata_json) : null,
      createdAt: row.created_at,
      ip: row.ip ?? null,
      userAgent: row.user_agent ?? null,
    }));
  }

  function safeParseJson(value: string): Record<string, unknown> | null {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return {
    createOtpChallenge,
    findOtpChallenge,
    incrementOtpAttempts,
    updateChallengeStatus,
    expirePendingChallenges,
    createSession,
    findSession,
    revokeSession,
    expireSessions,
    appendAuditLog,
    listAuditLogs,
  };
}

export function createInMemorySecurityStore(): SecurityStore {
  const challenges = new Map<string, OtpChallengeRecord>();
  const sessions = new Map<string, SessionRecord>();
  const auditLogs: AuditLogRecord[] = [];

  const cloneChallenge = (challenge?: OtpChallengeRecord): OtpChallengeRecord | undefined =>
    challenge ? { ...challenge } : undefined;
  const cloneSession = (session?: SessionRecord): SessionRecord | undefined => (session ? { ...session } : undefined);
  const cloneAudit = (audit: AuditLogRecord): AuditLogRecord => ({ ...audit, metadata: audit.metadata ? { ...audit.metadata } : null });

  function createOtpChallenge(input: CreateOtpChallengeInput) {
    challenges.set(input.id, {
      id: input.id,
      username: input.username,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      status: 'pending',
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      deliveryChannel: input.deliveryChannel,
      deliveryMetadata: input.deliveryMetadata ?? null,
      salt: input.salt,
      otpHash: input.otpHash,
      consumedAt: null,
    });
  }

  function findOtpChallenge(id: string) {
    return cloneChallenge(challenges.get(id));
  }

  function incrementOtpAttempts(id: string): number {
    const record = challenges.get(id);
    if (!record) return 0;
    record.attempts += 1;
    return record.attempts;
  }

  function updateChallengeStatus(id: string, status: ChallengeStatus, consumedAt?: string) {
    const record = challenges.get(id);
    if (!record) return;
    record.status = status;
    if (consumedAt) {
      record.consumedAt = consumedAt;
    }
  }

  function expirePendingChallenges(nowIso: string) {
    for (const record of challenges.values()) {
      if (record.status === 'pending' && record.expiresAt <= nowIso) {
        record.status = 'expired';
        record.consumedAt = record.consumedAt ?? nowIso;
      }
    }
  }

  function createSession(input: CreateSessionInput) {
    sessions.set(input.id, {
      id: input.id,
      username: input.username,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  function findSession(id: string) {
    return cloneSession(sessions.get(id));
  }

  function revokeSession(id: string, revokedAt: string) {
    const record = sessions.get(id);
    if (!record) return;
    record.revokedAt = revokedAt;
  }

  function expireSessions(nowIso: string) {
    for (const session of sessions.values()) {
      if (!session.revokedAt && session.expiresAt <= nowIso) {
        session.revokedAt = nowIso;
      }
    }
  }

  function appendAuditLog(entry: AuditEntryInput) {
    const createdAt = entry.createdAt ?? new Date().toISOString();
    auditLogs.push({
      id: randomUUID(),
      actor: entry.actor ?? null,
      action: entry.action,
      metadata: entry.metadata ? { ...entry.metadata } : null,
      createdAt,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
    if (auditLogs.length > 2000) {
      auditLogs.splice(0, auditLogs.length - 2000);
    }
  }

  function listAuditLogs(limit: number): AuditLogRecord[] {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50;
    return [...auditLogs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
      .map(cloneAudit);
  }

  return {
    createOtpChallenge,
    findOtpChallenge,
    incrementOtpAttempts,
    updateChallengeStatus,
    expirePendingChallenges,
    createSession,
    findSession,
    revokeSession,
    expireSessions,
    appendAuditLog,
    listAuditLogs,
  };
}
