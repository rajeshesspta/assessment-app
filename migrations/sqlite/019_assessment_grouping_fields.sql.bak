-- Add generic grouping and metadata fields to assessments
ALTER TABLE assessments ADD COLUMN collection_id TEXT;
ALTER TABLE assessments ADD COLUMN tags_json TEXT;
ALTER TABLE assessments ADD COLUMN metadata_json TEXT;

-- Index for collection-based lookups
CREATE INDEX idx_assessments_collection ON assessments(tenant_id, collection_id);
