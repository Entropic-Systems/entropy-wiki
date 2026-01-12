-- Migration 003: Fix effective_visibility trigger
-- The BEFORE trigger was reading OLD visibility from DB instead of using NEW.visibility

-- Drop and recreate the BEFORE trigger function with correct logic
CREATE OR REPLACE FUNCTION trigger_before_update_effective_visibility()
RETURNS TRIGGER AS $$
DECLARE
  current_id UUID;
  current_visibility VARCHAR(20);
  current_parent_id UUID;
BEGIN
  -- If visibility or parent changed, recalculate this page's effective visibility
  IF (TG_OP = 'INSERT') OR
     (OLD.visibility IS DISTINCT FROM NEW.visibility) OR
     (OLD.parent_id IS DISTINCT FROM NEW.parent_id) THEN

    -- Start with the new visibility for THIS page (not from DB which has old value)
    IF NEW.visibility = 'private' THEN
      NEW.effective_visibility := 'private';
    ELSE
      -- Walk up ancestors to check if any are private
      current_id := NEW.parent_id;  -- Start from parent, not self
      NEW.effective_visibility := 'public';  -- Default to public

      WHILE current_id IS NOT NULL LOOP
        SELECT visibility, parent_id INTO current_visibility, current_parent_id
        FROM pages WHERE id = current_id;

        IF current_visibility = 'private' THEN
          NEW.effective_visibility := 'private';
          EXIT;  -- No need to continue
        END IF;

        current_id := current_parent_id;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger binding already exists, we just replaced the function

-- Fix any existing pages with incorrect effective_visibility
-- For pages with no parent (parent_id IS NULL), effective_visibility should match visibility
-- For pages with parents, recalculate using the function
UPDATE pages
SET effective_visibility = visibility
WHERE parent_id IS NULL;

-- For pages with parents, use calculate_effective_visibility
-- But note: the function is now fixed, so we can just trigger an update
UPDATE pages
SET visibility = visibility
WHERE parent_id IS NOT NULL;

-- Record this migration
INSERT INTO _migrations (name) VALUES ('003_fix_visibility_trigger')
ON CONFLICT (name) DO NOTHING;
