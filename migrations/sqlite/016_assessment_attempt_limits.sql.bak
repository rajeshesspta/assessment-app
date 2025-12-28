ALTER TABLE assessments ADD COLUMN allowed_attempts INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_attempts_tenant_assessment_user
  ON attempts (tenant_id, assessment_id, user_id);
