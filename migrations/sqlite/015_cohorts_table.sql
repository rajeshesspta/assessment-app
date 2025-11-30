CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  learner_ids_json TEXT NOT NULL DEFAULT '[]',
  assessment_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cohorts_tenant ON cohorts (tenant_id);
