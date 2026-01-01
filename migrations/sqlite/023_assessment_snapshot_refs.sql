-- Migration: add item_snapshot_ids_json to assessments
-- Adds a JSON array column to store snapshot ids (ordered) referenced by an assessment

PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

ALTER TABLE assessments ADD COLUMN item_snapshot_ids_json TEXT;

-- Backfill note: existing assessments will have NULL in the new column until re-published

COMMIT;
PRAGMA foreign_keys=ON;
