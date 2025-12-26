-- Migration to add assignments_json to cohorts table for learner-specific quotas
ALTER TABLE cohorts ADD COLUMN assignments_json TEXT NOT NULL DEFAULT '[]';

-- Backfill assignments_json from assessment_ids_json
-- This is a bit tricky in SQLite without a JSON extension, but we can do a simple transformation if we assume it's just a list of strings.
-- However, since we are in development, we can also just let the application handle the migration on first save/load if we want to be safe.
-- For now, we'll just add the column.
