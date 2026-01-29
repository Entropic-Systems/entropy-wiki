-- Migration 008: Fix Referential Integrity Issues
-- Addresses critical database design flaws identified in code review

-- Add missing foreign key constraints to ensure referential integrity
-- This prevents orphaned records and data inconsistencies

-- 1. Add foreign key constraint for content_fingerprints
ALTER TABLE content_fingerprints
ADD CONSTRAINT fk_content_fingerprints_page
FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE;

-- 2. Add foreign key constraint for page_categories
ALTER TABLE page_categories
ADD CONSTRAINT fk_page_categories_page
FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE;

-- 3. Add foreign key constraint for content_quality_metrics
ALTER TABLE content_quality_metrics
ADD CONSTRAINT fk_content_quality_page
FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE;

-- 4. Add foreign key constraint for content_issues
ALTER TABLE content_issues
ADD CONSTRAINT fk_content_issues_page
FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE;

-- 5. Add foreign key constraint for document_embeddings (if vector extension available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings') THEN
        ALTER TABLE document_embeddings
        ADD CONSTRAINT fk_document_embeddings_page
        FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Constraint already exists, skip
        NULL;
END $$;

-- 6. Add foreign key constraint for knowledge_graph_nodes
ALTER TABLE knowledge_graph_nodes
ADD CONSTRAINT fk_kg_nodes_page
FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE CASCADE;

-- 7. Add foreign key constraint for journey_nodes (where page_slug is not null)
ALTER TABLE journey_nodes
ADD CONSTRAINT fk_journey_nodes_page
FOREIGN KEY (page_slug) REFERENCES pages(slug) ON DELETE SET NULL;

-- 8. Fix inefficient hash index - replace with btree
DROP INDEX IF EXISTS idx_fingerprints_semantic;
CREATE INDEX IF NOT EXISTS idx_fingerprints_semantic_btree
ON content_fingerprints USING btree (semantic_hash);

-- 9. Add triggers to maintain computed fields consistency
-- Update page_count in categories when page_categories changes
CREATE OR REPLACE FUNCTION update_category_page_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE categories
        SET page_count = page_count + 1
        WHERE id = NEW.category_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE categories
        SET page_count = GREATEST(0, page_count - 1)
        WHERE id = OLD.category_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_category_page_count ON page_categories;
CREATE TRIGGER trigger_update_category_page_count
    AFTER INSERT OR DELETE ON page_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_category_page_count();

-- Update connection_count in knowledge_graph_nodes when edges change
CREATE OR REPLACE FUNCTION update_node_connection_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE knowledge_graph_nodes
        SET connection_count = connection_count + 1
        WHERE page_slug = NEW.source_slug;

        IF NEW.bidirectional THEN
            UPDATE knowledge_graph_nodes
            SET connection_count = connection_count + 1
            WHERE page_slug = NEW.target_slug;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE knowledge_graph_nodes
        SET connection_count = GREATEST(0, connection_count - 1)
        WHERE page_slug = OLD.source_slug;

        IF OLD.bidirectional THEN
            UPDATE knowledge_graph_nodes
            SET connection_count = GREATEST(0, connection_count - 1)
            WHERE page_slug = OLD.target_slug;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_node_connection_count ON knowledge_graph_edges;
CREATE TRIGGER trigger_update_node_connection_count
    AFTER INSERT OR DELETE ON knowledge_graph_edges
    FOR EACH ROW
    EXECUTE FUNCTION update_node_connection_count();

-- 10. Add composite indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_page_categories_composite
ON page_categories (category_id, is_primary, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_kg_edges_composite
ON knowledge_graph_edges (source_slug, relationship_type, strength DESC);

CREATE INDEX IF NOT EXISTS idx_content_issues_composite
ON content_issues (page_slug, status, severity);

-- Record this migration
INSERT INTO _migrations (name) VALUES ('008_fix_referential_integrity')
ON CONFLICT (name) DO NOTHING;