-- Migration 002: Page hierarchy support
-- Adds parent-child relationships, ordering, and inherited visibility

-- Add parent_id column for tree structure (self-referencing)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES pages(id) ON DELETE SET NULL;

-- Add sort_order for sibling ordering within a parent
ALTER TABLE pages ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add effective_visibility (computed from parent chain, cached for performance)
-- 'private' if any ancestor is private, otherwise inherits own visibility
ALTER TABLE pages ADD COLUMN IF NOT EXISTS effective_visibility VARCHAR(20) DEFAULT 'public'
  CHECK (effective_visibility IN ('public', 'private'));

-- Indexes for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
CREATE INDEX IF NOT EXISTS idx_pages_sort_order ON pages(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pages_effective_visibility ON pages(effective_visibility);

-- Function to calculate effective visibility for a page
-- A page is effectively private if it or any ancestor is private
CREATE OR REPLACE FUNCTION calculate_effective_visibility(page_id UUID)
RETURNS VARCHAR(20) AS $$
DECLARE
  current_id UUID := page_id;
  current_visibility VARCHAR(20);
  current_parent_id UUID;
BEGIN
  -- Walk up the tree checking visibility
  WHILE current_id IS NOT NULL LOOP
    SELECT visibility, parent_id INTO current_visibility, current_parent_id
    FROM pages WHERE id = current_id;

    -- If any page in chain is private, effective visibility is private
    IF current_visibility = 'private' THEN
      RETURN 'private';
    END IF;

    current_id := current_parent_id;
  END LOOP;

  -- No private ancestor found
  RETURN 'public';
END;
$$ LANGUAGE plpgsql;

-- Function to update effective visibility for a page and all descendants
CREATE OR REPLACE FUNCTION update_effective_visibility_cascade(start_page_id UUID)
RETURNS VOID AS $$
DECLARE
  page_record RECORD;
BEGIN
  -- Update the starting page
  UPDATE pages
  SET effective_visibility = calculate_effective_visibility(start_page_id)
  WHERE id = start_page_id;

  -- Recursively update all descendants
  FOR page_record IN
    WITH RECURSIVE descendants AS (
      SELECT id FROM pages WHERE parent_id = start_page_id
      UNION ALL
      SELECT p.id FROM pages p
      INNER JOIN descendants d ON p.parent_id = d.id
    )
    SELECT id FROM descendants
  LOOP
    UPDATE pages
    SET effective_visibility = calculate_effective_visibility(page_record.id)
    WHERE id = page_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- BEFORE trigger: Update the current row's effective_visibility
CREATE OR REPLACE FUNCTION trigger_before_update_effective_visibility()
RETURNS TRIGGER AS $$
BEGIN
  -- If visibility or parent changed, recalculate this page's effective visibility
  IF (TG_OP = 'INSERT') OR
     (OLD.visibility IS DISTINCT FROM NEW.visibility) OR
     (OLD.parent_id IS DISTINCT FROM NEW.parent_id) THEN
    NEW.effective_visibility := calculate_effective_visibility(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AFTER trigger: Cascade to descendants (can modify other rows after current transaction step)
CREATE OR REPLACE FUNCTION trigger_after_cascade_effective_visibility()
RETURNS TRIGGER AS $$
DECLARE
  page_record RECORD;
BEGIN
  -- Only cascade on visibility or parent changes during UPDATE
  IF (TG_OP = 'UPDATE') AND
     ((OLD.visibility IS DISTINCT FROM NEW.visibility) OR
      (OLD.parent_id IS DISTINCT FROM NEW.parent_id)) THEN
    -- Recursively update all descendants
    FOR page_record IN
      WITH RECURSIVE descendants AS (
        SELECT id FROM pages WHERE parent_id = NEW.id
        UNION ALL
        SELECT p.id FROM pages p
        INNER JOIN descendants d ON p.parent_id = d.id
      )
      SELECT id FROM descendants
    LOOP
      UPDATE pages
      SET effective_visibility = calculate_effective_visibility(page_record.id)
      WHERE id = page_record.id;
    END LOOP;
  END IF;
  RETURN NULL; -- AFTER triggers return NULL
END;
$$ LANGUAGE plpgsql;

-- Create BEFORE trigger (updates current row)
DROP TRIGGER IF EXISTS trigger_pages_effective_visibility ON pages;
DROP TRIGGER IF EXISTS trigger_pages_effective_visibility_before ON pages;
CREATE TRIGGER trigger_pages_effective_visibility_before
  BEFORE INSERT OR UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_before_update_effective_visibility();

-- Create AFTER trigger (cascades to descendants)
DROP TRIGGER IF EXISTS trigger_pages_effective_visibility_after ON pages;
CREATE TRIGGER trigger_pages_effective_visibility_after
  AFTER UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_after_cascade_effective_visibility();

-- Initialize effective_visibility for existing pages
UPDATE pages SET effective_visibility = calculate_effective_visibility(id);

-- Record this migration
INSERT INTO _migrations (name) VALUES ('002_hierarchy')
ON CONFLICT (name) DO NOTHING;
