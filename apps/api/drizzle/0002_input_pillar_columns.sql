-- Input Pillar §19: raw source storage, chunking strategy, enrichment tracking
ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_content bytea;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_content_url text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_strategy text NOT NULL DEFAULT 'fixed';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS enrichment_status jsonb DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'document';
