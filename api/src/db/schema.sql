-- Entropy Wiki Database Schema
-- PostgreSQL 14+

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Pages table: stores wiki page metadata
CREATE TABLE pages (
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
CREATE TABLE page_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  author_type VARCHAR(20) DEFAULT 'human' CHECK (author_type IN ('human', 'ai')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_pages_slug ON pages(slug);
CREATE INDEX idx_pages_status ON pages(status);
CREATE INDEX idx_pages_visibility ON pages(visibility);
CREATE INDEX idx_pages_status_visibility ON pages(status, visibility);
CREATE INDEX idx_revisions_page_id ON page_revisions(page_id);
CREATE INDEX idx_revisions_created_at ON page_revisions(created_at DESC);

-- Foreign keys for revision pointers (added after both tables exist)
ALTER TABLE pages ADD CONSTRAINT fk_published_revision
  FOREIGN KEY (current_published_revision_id) REFERENCES page_revisions(id) ON DELETE SET NULL;
ALTER TABLE pages ADD CONSTRAINT fk_draft_revision
  FOREIGN KEY (current_draft_revision_id) REFERENCES page_revisions(id) ON DELETE SET NULL;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on pages
CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
