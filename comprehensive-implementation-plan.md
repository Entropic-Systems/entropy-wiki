# Comprehensive Plan: Claude Code Navbar + Automated Tech Scraping + Wiki Ingestion Improvements

## Current State Analysis

### 1. Navigation & Claude Code Integration
- **Current:** Claude Code is extensively documented (`/wiki/claude-code/`) but accessed via homepage links, not top-level navbar
- **Navigation:** Dynamic system using `_meta.json` files, SectionNav components, and API-driven structure
- **Architecture:** Next.js 15 App Router with responsive 3-column layout, sticky header, horizontal section tabs

### 2. Existing Scraping Infrastructure
- **Comprehensive Ingest System:** Already handles URLs, GitHub, Twitter, raw text via REST API (`/admin/ingest`)
- **Content Extractors:** ArticleExtractor, GitHubExtractor, TwitterExtractor, RawTextExtractor
- **AI-Powered Routing:** Claude integration with semantic similarity search using embeddings
- **Background Processing:** Job queue system with retry logic, batch processing (3 concurrent items)
- **Monitoring Collectors:** API health, GitHub Actions, Railway, Vercel collectors with debug workflows

### 3. Wiki Ingestion Functions
- **Database-First Architecture:** PostgreSQL with ingest_jobs/ingest_items tables
- **Processing Pipeline:** Extract → Route (AI + similarity) → Integrate (create/update pages)
- **Embedding System:** Vector similarity search using Xenova/all-MiniLM-L6-v2 model
- **Content Management:** Auto-generated markdown, revision tracking, publish/draft modes

## Requirements Summary

Based on our clarification session:
- **Claude Code Navigation**: Make Claude Code a top-level navbar tab (same as Orchestration)
- **Automated Tech Scraping**: Weekly digest + event-driven collection of AI/ML developments, GitHub trending repos, and Twitter/X orchestration content
- **Wiki Ingestion Improvements**: Better deduplication, enhanced formatting, automated categorization, and source reliability scoring

## Implementation Plan

### Component 1: Claude Code Navbar Integration

**Complexity**: Simple (2-3 files, minimal changes)

**Root Cause**: Claude Code is defined in `app/_meta.json` but missing navigation structure files.

**Required Changes**:
1. **Create**: `/data/projects/wiki/wiki/claude-code/_meta.json`
   ```json
   {
     "README": "Overview",
     "introduction": "Introduction",
     "quick-start": "Quick Start",
     "core-concepts": "Core Concepts",
     "agent-comparison": "Agent Comparison",
     "plugins": "Plugins"
   }
   ```

2. **Update**: `/data/projects/wiki/components/navigation/MobileNav.tsx`
   - Add `{ title: 'Claude Code', href: '/claude-code' }` to `DEFAULT_SECTIONS` array

**Why This Works**: The navigation system uses `buildNavTree()` which will automatically detect the claude-code directory and include it in top-level navigation once `_meta.json` exists.

### Component 2: Automated Tech Content Scraping System

**Complexity**: High (new architecture extending existing systems)

**Architecture**: Extend existing collector pattern and ingest pipeline

**New Components**:

1. **Content Discovery Collectors** (`/api/src/services/collectors/`):
   - `github-trending.ts` - Monitor trending AI/ML repos
   - `twitter-discovery.ts` - Track orchestration discussions, framework announcements
   - `content-aggregator.ts` - RSS feeds, Hacker News, dev.to
   - `release-monitor.ts` - Track key repository releases

2. **Discovery Orchestration** (`/api/src/services/content-discovery.ts`):
   - Multi-source content discovery with quality filtering
   - Automatic submission to existing ingest pipeline
   - Configurable thresholds and source priorities

3. **Scheduling System** (`.github/workflows/content-discovery.yml`):
   - Weekly comprehensive scan (Monday 6 AM UTC)
   - Daily trending check (8 AM UTC)
   - Event-driven triggers for breaking updates

4. **Quality Assessment**:
   - Multi-factor scoring: relevance, authority, freshness, uniqueness, engagement
   - Auto-ingest threshold (default: 0.8)
   - Review mode for uncertain content

**Integration**: Uses existing ingest API, extractors, and background processor - no changes to core pipeline needed.

### Component 3: Enhanced Wiki Ingestion System

**Complexity**: High (significant enhancements to existing pipeline)

**Four Major Enhancements**:

1. **Enhanced Deduplication**:
   - Multi-threshold similarity (exact: 0.98+, near: 0.90-0.98, related: 0.75-0.90)
   - Content fingerprinting with URL canonicalization and semantic hashing
   - N-gram overlap analysis for partial duplicates
   - New table: `content_fingerprints`

2. **Advanced Formatting**:
   - Content-type-specific formatters (technical, academic, news, social)
   - Enhanced Claude prompting with context awareness
   - Quality assessment (readability, structure, completeness scores)
   - Multi-pass formatting pipeline

3. **Automated Categorization**:
   - AI-powered topic classification with confidence scoring
   - Wiki structure analysis for optimal section placement
   - Hierarchical category system with parent/child relationships
   - New tables: `categories`, `page_categories`

4. **Source Reliability Scoring**:
   - Domain reputation metrics (authority, age, SSL)
   - Content quality history tracking
   - Author credibility assessment
   - Platform-specific scoring (GitHub stars, social engagement)
   - New table: `source_reliability`

**Database Schema Updates**:
- Migration `007_enhanced_ingestion.sql` with new tables and columns
- Enhanced indexing for performance optimization

## Implementation Phases

### Phase 1: Quick Win - Claude Code Navbar (Week 1)
- Create `_meta.json` file for Claude Code navigation
- Update mobile navigation fallback array
- Test navbar functionality across devices
- **Deliverable**: Claude Code appears as top-level navbar tab

### Phase 2: Foundation - Enhanced Ingestion (Weeks 2-3)
- Implement enhanced deduplication system
- Add source reliability scoring framework
- Create database migrations and new tables
- **Deliverable**: Better content quality and duplicate detection

### Phase 3: Intelligence - Advanced Features (Weeks 3-4)
- Implement automated categorization system
- Add content-type-specific formatters
- Create quality assessment pipeline
- **Deliverable**: Smarter content processing and organization

### Phase 4: Automation - Content Discovery (Weeks 4-6)
- Create content discovery collectors
- Implement quality filtering and auto-submission
- Set up scheduled workflows for content discovery
- **Deliverable**: Automated tech content collection system

### Phase 5: Integration & Optimization (Week 6)
- Performance optimization for all new features
- Create admin interfaces for configuration
- Comprehensive testing and monitoring
- **Deliverable**: Production-ready integrated system

## Critical Files

**Claude Code Navigation**:
- `/data/projects/wiki/wiki/claude-code/_meta.json` (create)
- `/data/projects/wiki/components/navigation/MobileNav.tsx` (update)

**Content Discovery System**:
- `/api/src/services/collectors/github-trending.ts` (create)
- `/api/src/services/collectors/twitter-discovery.ts` (create)
- `/api/src/services/content-discovery.ts` (create)
- `/.github/workflows/content-discovery.yml` (create)

**Enhanced Ingestion**:
- `/api/src/services/deduplication.ts` (create)
- `/api/src/services/source-reliability.ts` (create)
- `/api/src/services/categorization.ts` (create)
- `/api/src/db/migrations/007_enhanced_ingestion.sql` (create)

**Configuration**:
- `/api/src/services/content-filter.ts` (create)
- `/api/src/services/formatters/` (create directory with specialized formatters)

## Verification & Testing

**Claude Code Navigation**:
1. Verify "Claude Code" tab appears in navbar alongside "Orchestration"
2. Test navigation to `/claude-code` and active state styling
3. Confirm mobile navigation includes Claude Code
4. Check sidebar navigation works for Claude Code pages

**Content Discovery**:
1. Run manual content discovery to verify source integration
2. Test quality filtering with various content types
3. Verify automated submission to ingest pipeline
4. Monitor scheduled workflows and error handling

**Enhanced Ingestion**:
1. Test enhanced deduplication with similar content
2. Verify source reliability scoring across domains
3. Check automated categorization accuracy
4. Test improved formatting for different content types

**Integration Testing**:
1. End-to-end content flow: Discovery → Ingest → Process → Publish
2. Performance testing with batch content processing
3. Error handling and retry mechanisms
4. Admin interface functionality and configuration management

## Success Metrics

- Claude Code accessible via navbar (100% success rate)
- Weekly automated content discovery (>50 high-quality items/week)
- Improved deduplication (>90% duplicate detection accuracy)
- Enhanced content quality (>0.8 average formatting score)
- Automated categorization (>85% correct category assignment)