-- Migration 006: Page embeddings with pgvector
-- OPTIONAL: Requires pgvector extension to be installed
-- Skip this migration if pgvector is not available

-- Enable pgvector extension for embedding storage and similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Page embeddings table: vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS page_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES page_revisions(id) ON DELETE CASCADE,
  -- OpenAI text-embedding-3-small produces 1536-dimensional vectors
  embedding vector(1536) NOT NULL,
  -- Metadata for the embedding
  chunk_index INTEGER DEFAULT 0, -- For pages split into chunks
  chunk_text TEXT, -- The text that was embedded
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for page_embeddings queries
CREATE INDEX IF NOT EXISTS idx_page_embeddings_page_id ON page_embeddings(page_id);
CREATE INDEX IF NOT EXISTS idx_page_embeddings_revision_id ON page_embeddings(revision_id);

-- Unique constraint for upsert operations (page + revision + chunk)
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_embeddings_unique
  ON page_embeddings(page_id, revision_id, chunk_index);

-- HNSW index for fast approximate nearest neighbor search on embeddings
-- HNSW provides excellent query performance for similarity search
CREATE INDEX IF NOT EXISTS idx_page_embeddings_hnsw ON page_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Record this migration
INSERT INTO _migrations (name) VALUES ('006_embeddings')
ON CONFLICT (name) DO NOTHING;
