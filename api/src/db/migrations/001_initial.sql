-- Migration 001: Initial schema
-- Run this migration to set up the database from scratch

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Pages table: stores wiki page metadata
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  current_published_revision_id UUID,
  current_draft_revision_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page revisions table: stores content history
CREATE TABLE IF NOT EXISTS page_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  author_type VARCHAR(20) DEFAULT 'human' CHECK (author_type IN ('human', 'ai')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
CREATE INDEX IF NOT EXISTS idx_pages_visibility ON pages(visibility);
CREATE INDEX IF NOT EXISTS idx_pages_status_visibility ON pages(status, visibility);
CREATE INDEX IF NOT EXISTS idx_revisions_page_id ON page_revisions(page_id);
CREATE INDEX IF NOT EXISTS idx_revisions_created_at ON page_revisions(created_at DESC);

-- Foreign keys for revision pointers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_published_revision'
  ) THEN
    ALTER TABLE pages ADD CONSTRAINT fk_published_revision
      FOREIGN KEY (current_published_revision_id) REFERENCES page_revisions(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_draft_revision'
  ) THEN
    ALTER TABLE pages ADD CONSTRAINT fk_draft_revision
      FOREIGN KEY (current_draft_revision_id) REFERENCES page_revisions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on pages (drop first if exists)
DROP TRIGGER IF EXISTS update_pages_updated_at ON pages;
CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Record this migration
INSERT INTO _migrations (name) VALUES ('001_initial')
ON CONFLICT (name) DO NOTHING;
