PRAGMA foreign_keys = ON;

ALTER TABLE attempts ADD COLUMN item_version_ids_json TEXT;
