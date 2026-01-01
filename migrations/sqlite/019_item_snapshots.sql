-- Migration 019: Create item_snapshots table
-- Stores immutable snapshots of items taken at assessment publish/assignment time

CREATE TABLE IF NOT EXISTS item_snapshots (
    tenant_id TEXT NOT NULL,
    id TEXT PRIMARY KEY NOT NULL,
    original_item_id TEXT NOT NULL,
    item_version TEXT,
    snapshot_json TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_snapshots_tenant_original ON item_snapshots (tenant_id, original_item_id);
CREATE INDEX IF NOT EXISTS idx_item_snapshots_tenant_createdat ON item_snapshots (tenant_id, created_at);
