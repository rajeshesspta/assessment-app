PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

DROP INDEX IF EXISTS idx_items_tenant_id;

ALTER TABLE items RENAME TO items_old;

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  answer_mode TEXT NOT NULL DEFAULT 'single',
  correct_indexes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_items_tenant_id ON items (tenant_id, id);

INSERT INTO items (id, tenant_id, kind, prompt, choices_json, answer_mode, correct_indexes_json, created_at, updated_at)
SELECT id,
       tenant_id,
       kind,
       prompt,
       choices_json,
       'single' AS answer_mode,
       json_array(correct_index) AS correct_indexes_json,
       created_at,
       updated_at
FROM items_old;

DROP TABLE items_old;

COMMIT;
PRAGMA foreign_keys = ON;
