-- Migration 007: Intelligence Platform Foundation
-- Creates ~15 tables for Phase 2-6 features:
-- - Content Quality & Deduplication
-- - Semantic Search
-- - AI Learning Companion
-- - Knowledge Graph
-- - Learning Journeys

-- ============================================================================
-- CONTENT QUALITY & DEDUPLICATION (Phase 2-3)
-- ============================================================================

-- Content fingerprints for deduplication
CREATE TABLE IF NOT EXISTS content_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug VARCHAR(255) UNIQUE NOT NULL,
  url_canonical VARCHAR(2048),
  semantic_hash BYTEA,
  ngram_signature BYTEA,
  title_normalized VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source reliability scoring
CREATE TABLE IF NOT EXISTS source_reliability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) UNIQUE NOT NULL,
  overall_score FLOAT DEFAULT 0.5 CHECK (overall_score >= 0 AND overall_score <= 1),
  domain_authority FLOAT CHECK (domain_authority IS NULL OR (domain_authority >= 0 AND domain_authority <= 1)),
  content_quality_history FLOAT CHECK (content_quality_history IS NULL OR (content_quality_history >= 0 AND content_quality_history <= 1)),
  update_frequency FLOAT,
  citation_network FLOAT,
  platform_metrics JSONB DEFAULT '{}',
  last_evaluated TIMESTAMPTZ,
  confidence_level VARCHAR(20) DEFAULT 'low' CHECK (confidence_level IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hierarchical categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  icon VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,
  auto_classification_rules JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page-category assignments
CREATE TABLE IF NOT EXISTS page_categories (
  page_slug VARCHAR(255) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_by VARCHAR(50) DEFAULT 'system' CHECK (assigned_by IN ('system', 'user', 'ai')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (page_slug, category_id)
);

-- Content quality metrics
CREATE TABLE IF NOT EXISTS content_quality_metrics (
  page_slug VARCHAR(255) PRIMARY KEY,
  quality_score FLOAT CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1)),
  readability_score FLOAT,
  completeness_score FLOAT,
  freshness_score FLOAT,
  last_analyzed TIMESTAMPTZ,
  analysis_results JSONB DEFAULT '{}',
  improvement_suggestions JSONB DEFAULT '[]',
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content issues tracking
CREATE TABLE IF NOT EXISTS content_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug VARCHAR(255) NOT NULL,
  issue_type VARCHAR(50) NOT NULL CHECK (issue_type IN ('broken_link', 'stale_content', 'inconsistent_style', 'missing_section', 'typo', 'outdated_code', 'other')),
  severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  location_hint TEXT,
  suggested_fix TEXT,
  auto_fixable BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'fixed', 'wont_fix', 'duplicate')),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  fixed_at TIMESTAMPTZ,
  fixed_by VARCHAR(100)
);

-- ============================================================================
-- SEMANTIC SEARCH (Phase 2) - Vector-dependent tables
-- ============================================================================

DO $$
BEGIN
    -- Check if vector extension is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        -- Document embeddings for semantic search (extends page_embeddings from 006)
        CREATE TABLE IF NOT EXISTS document_embeddings (
          page_slug VARCHAR(255) PRIMARY KEY,
          embedding vector(384),
          concepts JSONB DEFAULT '[]',
          intent_tags TEXT[] DEFAULT '{}',
          difficulty_score INTEGER CHECK (difficulty_score IS NULL OR (difficulty_score >= 1 AND difficulty_score <= 5)),
          related_ids TEXT[] DEFAULT '{}',
          last_updated TIMESTAMPTZ DEFAULT NOW()
        );

        -- Search analytics with embedding support
        CREATE TABLE IF NOT EXISTS search_analytics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID,
          query TEXT NOT NULL,
          query_embedding vector(384),
          intent VARCHAR(50),
          results_count INTEGER DEFAULT 0,
          results_clicked INTEGER[] DEFAULT '{}',
          time_to_click_ms INTEGER,
          session_context JSONB DEFAULT '{}',
          user_feedback VARCHAR(20) CHECK (user_feedback IS NULL OR user_feedback IN ('relevant', 'not_relevant', 'partially_relevant')),
          timestamp TIMESTAMPTZ DEFAULT NOW()
        );

        RAISE NOTICE 'Created semantic search tables with vector support';
    ELSE
        -- Create fallback tables without vector columns
        CREATE TABLE IF NOT EXISTS document_embeddings (
          page_slug VARCHAR(255) PRIMARY KEY,
          concepts JSONB DEFAULT '[]',
          intent_tags TEXT[] DEFAULT '{}',
          difficulty_score INTEGER CHECK (difficulty_score IS NULL OR (difficulty_score >= 1 AND difficulty_score <= 5)),
          related_ids TEXT[] DEFAULT '{}',
          last_updated TIMESTAMPTZ DEFAULT NOW()
        );

        -- Search analytics without embedding column
        CREATE TABLE IF NOT EXISTS search_analytics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID,
          query TEXT NOT NULL,
          intent VARCHAR(50),
          results_count INTEGER DEFAULT 0,
          results_clicked INTEGER[] DEFAULT '{}',
          time_to_click_ms INTEGER,
          session_context JSONB DEFAULT '{}',
          user_feedback VARCHAR(20) CHECK (user_feedback IS NULL OR user_feedback IN ('relevant', 'not_relevant', 'partially_relevant')),
          timestamp TIMESTAMPTZ DEFAULT NOW()
        );

        RAISE NOTICE 'Created semantic search tables without vector support (pgvector not available)';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating semantic search tables: %', SQLERRM;
END $$;

-- ============================================================================
-- AI LEARNING COMPANION (Phase 4)
-- ============================================================================

-- User sessions for AI interactions
CREATE TABLE IF NOT EXISTS ai_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  skill_level VARCHAR(50) DEFAULT 'beginner' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  preferences JSONB DEFAULT '{}',
  topics_of_interest TEXT[] DEFAULT '{}',
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI interaction history
CREATE TABLE IF NOT EXISTS ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ai_user_sessions(id) ON DELETE CASCADE,
  page_slug VARCHAR(255),
  interaction_type VARCHAR(50) DEFAULT 'question' CHECK (interaction_type IN ('question', 'explanation', 'quiz', 'summary', 'example', 'feedback')),
  question TEXT,
  response TEXT,
  difficulty_requested VARCHAR(50),
  helpful_rating INTEGER CHECK (helpful_rating IS NULL OR (helpful_rating >= 1 AND helpful_rating <= 5)),
  feedback_text TEXT,
  tokens_used INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning pattern tracking
CREATE TABLE IF NOT EXISTS user_learning_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ai_user_sessions(id) ON DELETE CASCADE,
  topic VARCHAR(255) NOT NULL,
  pages_visited TEXT[] DEFAULT '{}',
  time_spent_seconds INTEGER DEFAULT 0,
  comprehension_score FLOAT CHECK (comprehension_score IS NULL OR (comprehension_score >= 0 AND comprehension_score <= 1)),
  quiz_scores JSONB DEFAULT '[]',
  struggle_points JSONB DEFAULT '[]',
  mastery_level VARCHAR(20) DEFAULT 'novice' CHECK (mastery_level IN ('novice', 'learning', 'competent', 'proficient', 'expert')),
  last_visited TIMESTAMPTZ DEFAULT NOW(),
  first_visited TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, topic)
);

-- ============================================================================
-- KNOWLEDGE GRAPH (Phase 5)
-- ============================================================================

-- Knowledge graph nodes
CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255),
  category VARCHAR(100),
  node_type VARCHAR(50) DEFAULT 'concept' CHECK (node_type IN ('concept', 'tutorial', 'reference', 'example', 'tool')),
  importance_score FLOAT DEFAULT 0.5 CHECK (importance_score >= 0 AND importance_score <= 1),
  connection_count INTEGER DEFAULT 0,
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  position_z FLOAT DEFAULT 0,
  cluster_id VARCHAR(100),
  difficulty_score INTEGER CHECK (difficulty_score IS NULL OR (difficulty_score >= 1 AND difficulty_score <= 5)),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge graph edges
CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug VARCHAR(255) NOT NULL,
  target_slug VARCHAR(255) NOT NULL,
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('prerequisite', 'related', 'extends', 'contradicts', 'supersedes', 'references', 'implements')),
  strength FLOAT DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
  bidirectional BOOLEAN DEFAULT FALSE,
  auto_detected BOOLEAN DEFAULT TRUE,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_slug, target_slug, relationship_type)
);

-- ============================================================================
-- LEARNING JOURNEYS (Phase 4-5)
-- ============================================================================

-- Learning journeys
CREATE TABLE IF NOT EXISTS learning_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_session UUID REFERENCES ai_user_sessions(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  description TEXT,
  goal_type VARCHAR(50) CHECK (goal_type IN ('skill_acquisition', 'certification', 'project_based', 'exploration', 'custom')),
  goal_specifics JSONB DEFAULT '{}',
  difficulty VARCHAR(20) DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')),
  estimated_hours INTEGER,
  node_count INTEGER DEFAULT 0,
  prerequisites JSONB DEFAULT '[]',
  target_audience TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_public BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journey nodes
CREATE TABLE IF NOT EXISTS journey_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  page_slug VARCHAR(255),
  external_url VARCHAR(2048),
  node_type VARCHAR(50) DEFAULT 'content' CHECK (node_type IN ('content', 'quiz', 'exercise', 'checkpoint', 'milestone', 'resource')),
  title VARCHAR(255),
  description TEXT,
  sequence_order INTEGER NOT NULL,
  estimated_minutes INTEGER DEFAULT 15,
  prerequisites JSONB DEFAULT '[]',
  completion_criteria JSONB DEFAULT '{}',
  adaptive_content JSONB DEFAULT '{}',
  is_optional BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning progress
CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_session UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  node_id UUID REFERENCES journey_nodes(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  time_spent_seconds INTEGER DEFAULT 0,
  completion_percentage FLOAT DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  comprehension_score FLOAT CHECK (comprehension_score IS NULL OR (comprehension_score >= 0 AND comprehension_score <= 1)),
  attempts INTEGER DEFAULT 0,
  notes TEXT,
  last_accessed TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_session, journey_id, node_id)
);

-- User badges/achievements
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_session UUID NOT NULL REFERENCES ai_user_sessions(id) ON DELETE CASCADE,
  badge_type VARCHAR(100) NOT NULL,
  badge_name VARCHAR(255) NOT NULL,
  description TEXT,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE SET NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_session, badge_type, badge_name)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Content fingerprints indexes
CREATE INDEX IF NOT EXISTS idx_fingerprints_semantic ON content_fingerprints USING hash (semantic_hash);
CREATE INDEX IF NOT EXISTS idx_fingerprints_updated ON content_fingerprints (updated_at DESC);

-- Source reliability indexes
CREATE INDEX IF NOT EXISTS idx_source_reliability_domain ON source_reliability (domain);
CREATE INDEX IF NOT EXISTS idx_source_reliability_score ON source_reliability (overall_score DESC);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug);

-- Page categories indexes
CREATE INDEX IF NOT EXISTS idx_page_categories_slug ON page_categories (page_slug);
CREATE INDEX IF NOT EXISTS idx_page_categories_category ON page_categories (category_id);
CREATE INDEX IF NOT EXISTS idx_page_categories_primary ON page_categories (page_slug) WHERE is_primary = TRUE;

-- Content quality indexes
CREATE INDEX IF NOT EXISTS idx_content_quality_score ON content_quality_metrics (quality_score DESC);

-- Content issues indexes
CREATE INDEX IF NOT EXISTS idx_content_issues_slug ON content_issues (page_slug);
CREATE INDEX IF NOT EXISTS idx_content_issues_status ON content_issues (status, severity);
CREATE INDEX IF NOT EXISTS idx_content_issues_type ON content_issues (issue_type);

-- Search analytics indexes
CREATE INDEX IF NOT EXISTS idx_search_analytics_session ON search_analytics (session_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_timestamp ON search_analytics (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics USING gin (to_tsvector('english', query));

-- AI user sessions indexes
CREATE INDEX IF NOT EXISTS idx_ai_sessions_session_id ON ai_user_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_last_active ON ai_user_sessions (last_active DESC);

-- AI interactions indexes
CREATE INDEX IF NOT EXISTS idx_ai_interactions_session ON ai_interactions (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_page ON ai_interactions (page_slug);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_created ON ai_interactions (created_at DESC);

-- Learning patterns indexes
CREATE INDEX IF NOT EXISTS idx_learning_patterns_session ON user_learning_patterns (session_id);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_topic ON user_learning_patterns (topic);

-- Knowledge graph indexes
CREATE INDEX IF NOT EXISTS idx_kg_nodes_category ON knowledge_graph_nodes (category);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON knowledge_graph_nodes (node_type);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_cluster ON knowledge_graph_nodes (cluster_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON knowledge_graph_edges (source_slug);
CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON knowledge_graph_edges (target_slug);
CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON knowledge_graph_edges (relationship_type);

-- Learning journeys indexes
CREATE INDEX IF NOT EXISTS idx_journeys_status ON learning_journeys (status);
CREATE INDEX IF NOT EXISTS idx_journeys_public ON learning_journeys (is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_journeys_user ON learning_journeys (user_session);

-- Journey nodes indexes
CREATE INDEX IF NOT EXISTS idx_journey_nodes_journey ON journey_nodes (journey_id);
CREATE INDEX IF NOT EXISTS idx_journey_nodes_order ON journey_nodes (journey_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_journey_nodes_page ON journey_nodes (page_slug);

-- Learning progress indexes
CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_progress (user_session, journey_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_status ON learning_progress (status);
CREATE INDEX IF NOT EXISTS idx_learning_progress_journey ON learning_progress (journey_id);

-- User badges indexes
CREATE INDEX IF NOT EXISTS idx_user_badges_session ON user_badges (user_session);
CREATE INDEX IF NOT EXISTS idx_user_badges_type ON user_badges (badge_type);

-- ============================================================================
-- VECTOR INDEXES (requires pgvector extension)
-- ============================================================================

DO $$
BEGIN
    -- Only create vector indexes if pgvector is available and vector columns exist
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        -- Check if the embedding column exists in document_embeddings
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'document_embeddings'
            AND column_name = 'embedding'
        ) THEN
            -- Vector index for document embeddings
            CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON document_embeddings
              USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        END IF;

        -- Check if the query_embedding column exists in search_analytics
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'search_analytics'
            AND column_name = 'query_embedding'
        ) THEN
            -- Vector index for search query embeddings
            CREATE INDEX IF NOT EXISTS idx_search_analytics_query_embedding ON search_analytics
              USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 50);
        END IF;

        RAISE NOTICE 'Created vector indexes for semantic search';
    ELSE
        RAISE NOTICE 'Skipped vector indexes - pgvector extension not available';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating vector indexes: %', SQLERRM;
END $$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at for content_fingerprints
DROP TRIGGER IF EXISTS update_content_fingerprints_updated_at ON content_fingerprints;
CREATE TRIGGER update_content_fingerprints_updated_at
  BEFORE UPDATE ON content_fingerprints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for source_reliability
DROP TRIGGER IF EXISTS update_source_reliability_updated_at ON source_reliability;
CREATE TRIGGER update_source_reliability_updated_at
  BEFORE UPDATE ON source_reliability
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for content_quality_metrics
DROP TRIGGER IF EXISTS update_content_quality_updated_at ON content_quality_metrics;
CREATE TRIGGER update_content_quality_updated_at
  BEFORE UPDATE ON content_quality_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for learning_journeys
DROP TRIGGER IF EXISTS update_learning_journeys_updated_at ON learning_journeys;
CREATE TRIGGER update_learning_journeys_updated_at
  BEFORE UPDATE ON learning_journeys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for knowledge_graph_nodes
DROP TRIGGER IF EXISTS update_kg_nodes_updated_at ON knowledge_graph_nodes;
CREATE TRIGGER update_kg_nodes_updated_at
  BEFORE UPDATE ON knowledge_graph_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RECORD MIGRATION
-- ============================================================================

INSERT INTO _migrations (name) VALUES ('007_intelligence_platform')
ON CONFLICT (name) DO NOTHING;
