CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  contact_email TEXT,
  api_key TEXT NOT NULL,
  rate_limit_json TEXT NOT NULL,
  persistence_provider TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);

INSERT OR IGNORE INTO tenants (
  id,
  name,
  slug,
  status,
  contact_email,
  api_key,
  rate_limit_json,
  persistence_provider,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'dev-tenant',
  'Better Shift Corp',
  'better-shift-corp',
  'active',
  NULL,
  'better-shift-api-key',
  '{"requestsPerMinute":600,"burst":120}',
  'sqlite',
  NULL,
  DATETIME('now'),
  DATETIME('now')
);
