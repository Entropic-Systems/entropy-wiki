-- Migration 005: Ingest system tables (without pgvector)
-- Adds tables for content ingestion pipeline
-- Note: Embeddings table moved to 006_embeddings.sql (requires pgvector)

-- Ingest jobs table: tracks batch ingestion operations
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  mode VARCHAR(20) DEFAULT 'manual' CHECK (mode IN ('manual', 'scheduled', 'api')),
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Ingest items table: individual items within a job
CREATE TABLE IF NOT EXISTS ingest_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES ingest_jobs(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('url', 'text', 'file', 'api')),
  source_url TEXT,
  source_content TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'routing', 'integrating', 'completed', 'failed', 'skipped')),
  -- Extraction results (populated after AI extraction)
  extracted_title TEXT,
  extracted_summary TEXT,
  extracted_content TEXT,
  extracted_topics TEXT[],
  extracted_entities JSONB,
  extraction_confidence REAL,
  -- Routing decision (populated after AI routing)
  routing_decision VARCHAR(20) CHECK (routing_decision IN ('new_page', 'update_page', 'append_section', 'merge', 'skip')),
  target_page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  target_section TEXT,
  routing_reasoning TEXT,
  routing_confidence REAL,
  -- Timestamps and errors
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for ingest_jobs queries
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status ON ingest_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_created_at ON ingest_jobs(created_at DESC);

-- Indexes for ingest_items queries
CREATE INDEX IF NOT EXISTS idx_ingest_items_job_id ON ingest_items(job_id);
CREATE INDEX IF NOT EXISTS idx_ingest_items_status ON ingest_items(status);
CREATE INDEX IF NOT EXISTS idx_ingest_items_source_type ON ingest_items(source_type);
CREATE INDEX IF NOT EXISTS idx_ingest_items_target_page ON ingest_items(target_page_id);

-- Function to auto-update processed_items count on ingest_jobs
CREATE OR REPLACE FUNCTION update_ingest_job_counts()
RETURNS TRIGGER AS $$
DECLARE
  old_was_incomplete BOOLEAN;
  new_is_complete BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Check if the old status was incomplete and new status is complete/failed
    old_was_incomplete := OLD.status IN ('pending', 'extracting', 'routing', 'integrating');
    new_is_complete := NEW.status IN ('completed', 'failed');

    -- Only increment counts when transitioning from incomplete to complete/failed
    IF old_was_incomplete AND new_is_complete THEN
      -- Use atomic operations to prevent race conditions
      IF NEW.status = 'completed' THEN
        UPDATE ingest_jobs
        SET processed_items = processed_items + 1
        WHERE id = NEW.job_id;
      ELSIF NEW.status = 'failed' THEN
        UPDATE ingest_jobs
        SET processed_items = processed_items + 1,
            failed_items = failed_items + 1
        WHERE id = NEW.job_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update job counts
DROP TRIGGER IF EXISTS trigger_update_ingest_job_counts ON ingest_items;
CREATE TRIGGER trigger_update_ingest_job_counts
  AFTER UPDATE ON ingest_items
  FOR EACH ROW
  EXECUTE FUNCTION update_ingest_job_counts();

-- Record this migration
INSERT INTO _migrations (name) VALUES ('005_ingest_system')
ON CONFLICT (name) DO NOTHING;
