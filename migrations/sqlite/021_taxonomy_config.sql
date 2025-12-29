-- Migration: 021_taxonomy_config.sql
-- Adds taxonomy_config table to store per-tenant taxonomy configuration

CREATE TABLE taxonomy_config (
  tenant_id TEXT NOT NULL,
  config_json TEXT NOT NULL, -- JSON object with taxonomy fields definition
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id)
);

-- Index for faster lookups
CREATE INDEX idx_taxonomy_config_tenant_id ON taxonomy_config (tenant_id);