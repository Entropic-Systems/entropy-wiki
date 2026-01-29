# Master Implementation Plan: Entropy-Wiki Intelligence Platform

## Executive Summary

This plan transforms the Entropy-Wiki documentation system from a static knowledge repository into an intelligent, adaptive learning platform. It combines practical near-term improvements with visionary AI-powered features to create the world's most effective technical documentation experience for multi-agent coordination knowledge.

---

## Part I: Current State Analysis

### Existing Infrastructure

**Navigation & Architecture:**
- Next.js 15 App Router with responsive 3-column layout
- Dynamic navigation using `_meta.json` files and `buildNavTree()`
- Sticky header with horizontal section tabs
- Claude Code extensively documented but not in top-level navbar

**Ingest & Processing Pipeline:**
- Database-first architecture with PostgreSQL (ingest_jobs/ingest_items tables)
- Content extractors: ArticleExtractor, GitHubExtractor, TwitterExtractor, RawTextExtractor
- AI-powered routing with Claude integration
- Vector similarity search using Xenova/all-MiniLM-L6-v2 embeddings
- Background job queue with retry logic, batch processing (3 concurrent items)

**Monitoring & Debug Systems:**
- Multi-service collectors: API health, GitHub Actions, Railway, Vercel
- Debug workflow with error baseline tracking
- CI-integrated validation gates

### Gap Analysis

| Area | Current State | Target State |
|------|---------------|--------------|
| Navigation | Claude Code buried in homepage links | Top-level navbar tab |
| Content Discovery | Manual, reactive | Automated, proactive |
| Content Quality | Basic deduplication | Multi-factor quality scoring |
| Learning Experience | Static text | Adaptive, multi-modal |
| Search | Keyword-based FlexSearch | Semantic + intent understanding |
| Content Creation | Manual markdown | AI-assisted with templates |

---

## Part II: Implementation Components

### Component 1: Claude Code Navbar Integration

**Complexity:** Simple (2-3 files, 1-2 hours)
**Priority:** Immediate Win

**Required Changes:**

1. **Create:** `/wiki/claude-code/_meta.json`
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

2. **Update:** `/components/navigation/MobileNav.tsx`
   - Add `{ title: 'Claude Code', href: '/claude-code' }` to `DEFAULT_SECTIONS` array

**Verification:**
- Claude Code appears as top-level navbar tab alongside Orchestration
- Navigation works on desktop and mobile
- Active state styling applies correctly

---

### Component 2: Automated Tech Content Scraping System

**Complexity:** High
**Priority:** Foundation

**Architecture:** Extends existing collector pattern and ingest pipeline

#### New Collectors (`/api/src/services/collectors/`)

| Collector | Purpose | Data Sources |
|-----------|---------|--------------|
| `github-trending.ts` | Monitor trending AI/ML repos | GitHub API, starring velocity |
| `twitter-discovery.ts` | Track orchestration discussions | X API, keyword monitoring |
| `content-aggregator.ts` | Aggregate tech news | RSS feeds, HN, dev.to |
| `release-monitor.ts` | Track key repo releases | GitHub releases API |

#### Discovery Orchestration (`/api/src/services/content-discovery.ts`)

```typescript
interface ContentDiscoveryConfig {
  sources: SourceConfig[]
  qualityThreshold: number  // 0-1, default 0.8
  maxItemsPerRun: number
  deduplicationWindow: string  // e.g., "7d"
  autoIngestEnabled: boolean
}

interface DiscoveredContent {
  url: string
  title: string
  summary: string
  source: string
  relevanceScore: number
  authorityScore: number
  freshnessScore: number
  uniquenessScore: number
  engagementScore: number
  compositeScore: number
  suggestedCategory: string
  tags: string[]
}
```

#### Scheduling (`.github/workflows/content-discovery.yml`)

| Schedule | Scope | Purpose |
|----------|-------|---------|
| Monday 6 AM UTC | Full scan | Weekly comprehensive discovery |
| Daily 8 AM UTC | Trending | Daily hot content check |
| On webhook | Event-driven | Breaking news/releases |

#### Quality Assessment Pipeline

```typescript
interface QualityAssessment {
  relevance: {
    score: number
    signals: string[]  // matching keywords, category alignment
  }
  authority: {
    score: number
    domainReputation: number
    authorCredibility: number
    citationCount: number
  }
  freshness: {
    score: number
    publishedAt: Date
    lastUpdated: Date
  }
  uniqueness: {
    score: number
    similarContent: string[]
    noveltyFactors: string[]
  }
  engagement: {
    score: number
    stars?: number
    shares?: number
    comments?: number
  }
}
```

---

### Component 3: Enhanced Wiki Ingestion System

**Complexity:** High
**Priority:** Foundation

#### 3.1 Enhanced Deduplication (`/api/src/services/deduplication.ts`)

**Multi-Threshold Similarity:**
| Threshold | Classification | Action |
|-----------|----------------|--------|
| 0.98+ | Exact duplicate | Reject |
| 0.90-0.98 | Near duplicate | Merge/update |
| 0.75-0.90 | Related content | Link reference |
| <0.75 | Unique | Accept |

**Content Fingerprinting:**
- URL canonicalization (remove tracking params, normalize protocols)
- Semantic hashing using embeddings
- N-gram overlap analysis for partial duplicates
- Title/heading similarity detection

**Database Schema:**
```sql
CREATE TABLE content_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug VARCHAR(255) UNIQUE,
  url_canonical VARCHAR(2048),
  semantic_hash BYTEA,
  ngram_signature BYTEA,
  title_normalized VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fingerprints_semantic ON content_fingerprints USING ivfflat (semantic_hash vector_cosine_ops);
```

#### 3.2 Source Reliability Scoring (`/api/src/services/source-reliability.ts`)

```typescript
interface SourceReliability {
  domain: string
  overallScore: number  // 0-1
  metrics: {
    domainAuthority: number  // Based on backlinks, age, SSL
    contentQualityHistory: number  // Past content accuracy
    updateFrequency: number  // How actively maintained
    citationNetwork: number  // How often cited by others
  }
  platformSpecific?: {
    githubStars?: number
    npmDownloads?: number
    socialEngagement?: number
  }
  lastEvaluated: Date
  confidenceLevel: 'high' | 'medium' | 'low'
}
```

#### 3.3 Automated Categorization (`/api/src/services/categorization.ts`)

**AI-Powered Classification:**
```typescript
interface CategoryClassification {
  primaryCategory: string
  secondaryCategories: string[]
  confidence: number
  reasoning: string
  suggestedPath: string  // e.g., "docs/orchestration/patterns"
  relatedPages: string[]
}
```

**Hierarchical Category System:**
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  parent_id UUID REFERENCES categories(id),
  description TEXT,
  auto_classification_rules JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE page_categories (
  page_slug VARCHAR(255),
  category_id UUID REFERENCES categories(id),
  confidence FLOAT,
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (page_slug, category_id)
);
```

#### 3.4 Advanced Formatting Pipeline

**Content-Type-Specific Formatters:**
| Content Type | Formatter | Special Handling |
|--------------|-----------|------------------|
| Technical docs | `TechnicalFormatter` | Code blocks, API refs |
| Academic papers | `AcademicFormatter` | Citations, abstracts |
| News articles | `NewsFormatter` | Key points, timeline |
| Social media | `SocialFormatter` | Thread reconstruction |

**Quality Assessment Metrics:**
```typescript
interface FormattingQuality {
  readabilityScore: number  // Flesch-Kincaid
  structureScore: number    // Heading hierarchy, sections
  completenessScore: number // Has intro, examples, refs
  codeQualityScore: number  // Syntax highlighting, runnable
  overallScore: number
}
```

---

### Component 4: AI-Powered Learning Companion

**Complexity:** High
**Priority:** Transformative Feature

#### Architecture

**Frontend Integration:**
- `AIAssistant.tsx` - floating chat widget (bottom-right, sticky)
- `AIContext.tsx` - wraps DocLayout, tracks reading patterns
- Matches cyber-utilitarian theme with subtle cyan glow effects

**Chat Interface State:**
```typescript
interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  currentPageContext: {
    slug: string
    title: string
    content: string
    section: string
  }
  userProfile: {
    skillLevel: 'beginner' | 'intermediate' | 'expert'
    recentTopics: string[]
    strugglingWith: string[]
  }
}
```

**Backend API Extensions (Express):**
- `POST /ai/explain` - contextual explanations for selected text
- `POST /ai/chat` - conversational interface with page context
- `POST /ai/profile/update` - user skill tracking updates

**Smart Context Features:**
- Section-aware: Uses current `docs/` section as context
- Code-aware: Integrates with react-markdown to identify code blocks
- History-aware: Tracks progression through documentation
- Difficulty adaptation: Adjusts based on time spent and help requests

**Database Schema:**
```sql
CREATE TABLE ai_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) UNIQUE,
  skill_level VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ai_user_sessions(id),
  page_slug VARCHAR(255),
  question TEXT,
  explanation TEXT,
  difficulty_requested VARCHAR(50),
  helpful_rating INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_learning_patterns (
  session_id UUID REFERENCES ai_user_sessions(id),
  topic VARCHAR(255),
  time_spent INTEGER,
  comprehension_score FLOAT,
  last_visited TIMESTAMP,
  PRIMARY KEY (session_id, topic)
);
```

---

### Component 5: Semantic Intelligence Engine

**Complexity:** High
**Priority:** Core Enhancement

#### Hybrid Search Architecture

```
User Query
    │
    ▼
┌─────────────────┐
│ Intent Classifier│
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌──────┐  ┌──────────┐
│Flex  │  │ Semantic │
│Search│  │  Search  │
└──┬───┘  └────┬─────┘
   │           │
   └─────┬─────┘
         ▼
┌─────────────────┐
│  Merge & Rank   │
└────────┬────────┘
         ▼
    Results
```

**Enhanced Search Index:**
```typescript
interface EnhancedSearchIndex {
  // Existing FlexSearch data
  id: string
  title: string
  content: string
  url: string
  category: string

  // New semantic data
  embedding: Float32Array  // 384-dim vector
  concepts: string[]       // extracted key concepts
  intent_tags: string[]    // "how-to", "troubleshooting", "reference"
  difficulty_score: number
  related_ids: string[]    // semantically similar pages
}
```

**Intent Classification:**
```typescript
const intentPatterns = {
  'setup': /how to (setup|install|configure|start)/i,
  'troubleshooting': /(error|fix|debug|problem|issue|fails?)/i,
  'concept': /(what is|explain|understand|concept)/i,
  'integration': /(connect|integrate|use with|combine)/i,
  'example': /(example|sample|demo|show me)/i
}
```

**Domain-Specific Query Examples:**
- "How to set up multi-agent workflows" → Gastown docs + coordination patterns
- "Fix beads dependency issues" → Troubleshooting guides + common solutions
- "Connect MCP servers to Claude" → Integration tutorials + configuration

**Database Schema:**
```sql
CREATE TABLE document_embeddings (
  page_slug VARCHAR(255) PRIMARY KEY,
  embedding VECTOR(384),
  concepts JSONB,
  intent_tags TEXT[],
  difficulty_score INTEGER,
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_embeddings_vector ON document_embeddings
  USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  query TEXT,
  intent VARCHAR(50),
  results_clicked INTEGER[],
  session_context JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

### Component 6: Progressive Disclosure Interface

**Complexity:** Medium
**Priority:** User Experience

#### Markdown Extensions

```markdown
# Getting Started with Beads

Basic overview here for everyone...

:::beginner "Quick Start"
Simple steps to get started:
1. Install beads: `npm install -g beads`
2. Create your first bead: `bd create "My first task"`
:::

:::intermediate "Configuration Options"
Advanced configuration:
- Custom storage backend
- Git hooks integration
- CI/CD workflow setup
:::

:::expert "Architecture Deep Dive"
Internal implementation details:
- JSONL storage format rationale
- Hash collision handling
- Distributed merge strategies
:::
```

**User Context System:**
```typescript
interface ProgressiveContext {
  userLevel: 'beginner' | 'intermediate' | 'expert' | 'adaptive'
  showLevel: number  // 1-3, controls what content is visible
  readingMode: 'guided' | 'reference' | 'overview'
  preferences: {
    autoExpand: boolean
    hideBasics: boolean
    showWarnings: boolean
    compactMode: boolean
  }
}
```

**Skill Detection Algorithm:**
- Time distribution across beginner vs advanced content
- Page progression patterns (basic → advanced)
- Search query complexity analysis
- Section expansion behavior tracking

**Interface Controls:**
- Skill level toggle: Beginner / Intermediate / Expert / Smart (adaptive)
- Reading mode selector: Guided / Reference / Overview
- Complexity slider: Basics Only / Most Content / Everything

---

### Component 7: Content Intelligence & Quality Engine

**Complexity:** High
**Priority:** Maintenance & Quality

#### Automated Quality Analysis

**Code Example Validation:**
```typescript
class CodeValidator {
  async validateCodeBlocks(pageContent: string): Promise<ValidationResult[]> {
    const codeBlocks = this.extractCodeBlocks(pageContent)

    for (const block of codeBlocks) {
      // JavaScript/TypeScript syntax check
      if (['javascript', 'typescript'].includes(block.language)) {
        await this.validateSyntax(block.code)
        await this.validateAPIUsage(block.code)  // Check against current APIs
      }

      // CLI command validation
      if (['bash', 'shell'].includes(block.language)) {
        await this.validateCliCommands(block.code)
      }

      // Config file validation
      if (['json', 'yaml', 'toml'].includes(block.language)) {
        await this.validateConfiguration(block.code, block.language)
      }
    }
  }
}
```

**Content Gap Detection:**
```typescript
interface GapAnalysis {
  missingConnections: MissingConnection[]  // Expected links not present
  orphanedConcepts: string[]  // Pages with no incoming links
  inconsistentTerminology: TerminologyIssue[]
  missingExamples: string[]  // Concepts without code examples
  outdatedReferences: OutdatedRef[]
}
```

**Link Validation:**
- Internal links: Check all slugs exist, suggest similar pages
- External links: HTTP validation, track link rot
- Image links: Verify all images load
- Anchor links: Validate heading anchors exist

**Quality Dashboard (`/admin/quality`):**
- Quality score heatmap across all pages
- Issue tracking with auto-fix suggestions
- Gap analysis visualization
- User confusion signal tracking

---

### Component 8: Interactive Code Sandboxes

**Complexity:** High
**Priority:** Learning Enhancement

#### Markdown Syntax

```markdown
```javascript interactive title="Try modifying this React hook"
const [count, setCount] = useState(0);
return <button onClick={() => setCount(c => c + 1)}>{count}</button>
```
```

#### Execution Engines

| Language | Engine | Notes |
|----------|--------|-------|
| JavaScript/TypeScript | WebContainers (StackBlitz) | Full Node.js in browser |
| React | Sandpack (CodeSandbox) | Optimized for components |
| Python | Pyodide (WASM) | Scientific computing support |
| Go | TinyGo WASM | Compiled execution |

**Backend Support:**
- `POST /sandbox/proxy` - CORS-safe API testing
- `POST /sandbox/save` - Persist user modifications
- `GET /sandbox/templates` - Pre-built environments

**Specific Use Cases:**
- **Beads Documentation:** Interactive `bd create`, `bd ready` examples
- **MCP Server Examples:** Live configuration testing
- **Agent Coordination:** Simulate multi-agent message passing
- **Prompt Engineering:** Live prompt testing with models

---

### Component 9: Visual Knowledge Galaxy

**Complexity:** Very High
**Priority:** Discovery Enhancement

#### 3D Visualization Engine

- **Library:** Three.js + React Three Fiber for WebGL
- **Physics:** Cannon.js for force-directed node positioning
- **Fallback:** D3.js 2D graph for devices without WebGL

**Node Data Structure:**
```typescript
interface KnowledgeNode {
  id: string  // page slug
  title: string
  category: 'beads' | 'gastown' | 'skills-bank' | 'prompt-bank' |
            'tooling-mcp' | 'orchestration' | 'context' | 'lab'
  nodeType: 'concept' | 'tutorial' | 'reference' | 'example' | 'tool'
  position: [number, number, number]
  connections: Connection[]
  metadata: {
    difficulty: number
    estimatedReadTime: number
    prerequisites: string[]
    completionRate: number
    popularity: number
  }
}
```

**Auto-Relationship Discovery (Build Time):**
- Link analysis: Parse markdown links between pages
- Content similarity: Embedding-based related content
- Keyword extraction: Shared technical terms
- Section hierarchy: Folder structure analysis

**Features:**
- Galaxy clustering by category with distinct visual regions
- Force physics: Related nodes attract, unrelated repel
- Visual encoding: Size=importance, Color=category, Glow=completion
- Search integration: Highlighted results in 3D space
- Learning paths: Animated guided routes through concepts

---

### Component 10: Personalized Learning Journeys

**Complexity:** Very High
**Priority:** Transformative Feature

#### Learning Path Engine

```typescript
interface LearningJourney {
  id: string
  userId: string
  title: string
  goal: LearningGoal
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'mixed'
  estimatedHours: number
  pathNodes: PathNode[]
  adaptations: PathAdaptation[]
}

interface LearningGoal {
  type: 'build_project' | 'understand_concept' | 'solve_problem' | 'integrate_system'
  specifics: {
    projectType?: 'multi_agent_system' | 'mcp_server' | 'beads_workflow'
    technologies?: string[]
    timeframe?: 'weekend' | 'week' | 'month' | 'flexible'
  }
}
```

#### User Onboarding Flow

1. **Goal Identification:**
   - Build a Multi-Agent Coordination System
   - Integrate Claude API into Applications
   - Automate Development Workflows
   - Understand Advanced AI Concepts

2. **Experience Assessment:**
   - JavaScript/TypeScript proficiency
   - Node.js & Backend Development
   - Git & Version Control
   - AI/ML APIs experience
   - Prompt Engineering knowledge

3. **Learning Preferences:**
   - Pace: Self-paced / Structured / Intensive
   - Style: Hands-on / Theory-first / Example-driven / Project-based
   - Depth: Overview / Practical / Comprehensive / Research-level

4. **Time Commitment:**
   - Casual (2hrs/week)
   - Regular (5hrs/week)
   - Focused (10hrs/week)
   - Intensive (20hrs/week)

#### Adaptive Learning Algorithm

```typescript
class AdaptiveLearningEngine {
  async analyzeAndAdapt(progressData: ProgressData): Promise<Adaptations> {
    const analysis = {
      paceAnalysis: this.analyzeLearningPace(progressData),
      comprehensionAnalysis: this.analyzeComprehension(progressData),
      engagementAnalysis: this.analyzeEngagement(progressData)
    }

    // If struggling: add support content, slow down
    // If advanced: skip basics, accelerate
    // If disengaged: change modality, add interactive elements

    return this.generateAdaptations(analysis)
  }
}
```

---

### Component 11: Smart Content Creation Assistant

**Complexity:** High
**Priority:** Content Scaling

#### AI Writing Partner

**Capabilities:**
- Generate documentation from code analysis
- Improve existing content (clarity, completeness, examples)
- Apply domain-specific templates
- Enforce style guide automatically

**Templates for Entropy-Wiki:**

1. **Beads Command Reference:**
   - Synopsis, Syntax, Description, Options, Examples, Related Commands

2. **Agent Coordination Pattern:**
   - Problem Statement, Context & Constraints, Solution, Implementation, Trade-offs

3. **MCP Server Configuration:**
   - Overview, Prerequisites, Configuration, Examples, Troubleshooting

**Style Guide Enforcement:**
```typescript
const entropyWikiStyleGuide = {
  terminology: [
    { term: 'beads', avoid: ['bead system'], context: 'Always lowercase' },
    { term: 'agent', avoid: ['bot', 'AI worker'] },
    { term: 'Claude API', avoid: ['Anthropic API'] }
  ],
  tone: {
    voice: 'cyber-utilitarian: direct, technical, purposeful',
    avoid: ['marketing speak', 'excessive enthusiasm']
  },
  structure: {
    progressiveDisclosure: true,
    codeExamplesRequired: ['reference', 'guide', 'tutorial']
  }
}
```

---

### Component 12: Multi-Modal Learning Hub

**Complexity:** Very High
**Priority:** Accessibility

#### Content Types

| Type | Technology | Use Case |
|------|------------|----------|
| Video | HeyGen/Synthesia AI avatars | Concept explanations |
| Audio | OpenAI TTS/ElevenLabs | Narrated walkthroughs |
| Interactive Diagrams | Mermaid.js + click/hover | Architecture visualization |
| Hands-On Labs | Terminal emulator + validation | Guided practice |

#### Markdown Extensions

```markdown
:::video "beads-workflow-intro"
title: "Getting Started with Beads"
script: |
  Welcome to Beads, the git-backed issue tracker designed for AI agents.
duration: 180
style: "code-demo"
:::

:::hands-on-lab "beads-quickstart"
title: "Try Beads Commands"
environment: "terminal"
steps:
  - command: "bd create 'My first bead'"
    explanation: "This creates a new task in the system"
    expected_output: "Created bead bd-a1b2c3"
:::
```

---

## Part III: Database Schema Summary

### New Tables Required

```sql
-- Enhanced Ingestion
content_fingerprints (id, page_slug, url_canonical, semantic_hash, ngram_signature)
source_reliability (domain, overall_score, metrics, platform_specific)
categories (id, slug, name, parent_id, description)
page_categories (page_slug, category_id, confidence, is_primary)

-- AI Learning Companion
ai_user_sessions (id, session_id, skill_level)
ai_interactions (id, session_id, page_slug, question, explanation)
user_learning_patterns (session_id, topic, time_spent, comprehension_score)

-- Semantic Search
document_embeddings (page_slug, embedding, concepts, intent_tags)
search_analytics (id, session_id, query, intent, results_clicked)

-- Content Quality
content_quality_metrics (page_slug, quality_score, analysis_results)
content_issues (id, page_slug, issue_type, severity, auto_fixable)

-- Knowledge Graph
knowledge_graph_nodes (id, page_slug, category, node_type, position)
knowledge_graph_edges (id, source_slug, target_slug, relationship_type, strength)

-- Learning Journeys
learning_journeys (id, user_session, title, goal_type, difficulty)
journey_nodes (id, journey_id, page_slug, node_type, sequence_order)
learning_progress (user_session, journey_id, node_id, status, time_spent)

-- Multimedia
multimedia_content (id, page_slug, content_type, assets, status)
user_learning_preferences (session_id, preferred_modalities, playback_speed)
```

---

## Part IV: Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
**Quick Wins + Core Infrastructure**

| Task | Complexity | Dependencies |
|------|------------|--------------|
| Claude Code navbar integration | Simple | None |
| Database migrations for new tables | Medium | None |
| Enhanced deduplication service | Medium | DB migrations |
| Source reliability scoring framework | Medium | DB migrations |

**Deliverables:**
- Claude Code accessible via navbar
- Database ready for new features
- Basic quality scoring operational

### Phase 2: Intelligence Layer (Weeks 3-4)
**Search & Categorization**

| Task | Complexity | Dependencies |
|------|------------|--------------|
| Semantic search engine (hybrid FlexSearch + vectors) | High | Embeddings |
| Automated categorization system | Medium | Categories table |
| Content quality analysis pipeline | High | Quality tables |
| Link validation service | Medium | None |

**Deliverables:**
- Intent-aware search operational
- Auto-categorization for new content
- Quality dashboard in admin

### Phase 3: Content Automation (Weeks 5-6)
**Discovery & Creation**

| Task | Complexity | Dependencies |
|------|------------|--------------|
| Content discovery collectors | High | Ingest pipeline |
| GitHub/Twitter/RSS aggregation | High | Collectors |
| Quality filtering & auto-ingest | Medium | Quality scoring |
| Scheduled workflows | Medium | Collectors |

**Deliverables:**
- Weekly automated content discovery
- >50 high-quality items/week ingested
- Quality threshold enforcement

### Phase 4: Learning Experience (Weeks 7-10)
**AI & Personalization**

| Task | Complexity | Dependencies |
|------|------------|--------------|
| AI Learning Companion (chat widget) | High | Claude API |
| Progressive disclosure system | Medium | Markdown processing |
| User skill detection | Medium | Learning patterns DB |
| Basic learning path generation | High | Journey tables |

**Deliverables:**
- AI assistant on all pages
- Adaptive content display
- Personalized learning paths

### Phase 5: Rich Media (Weeks 11-14)
**Interactive & Visual**

| Task | Complexity | Dependencies |
|------|------------|--------------|
| Interactive code sandboxes | Very High | WebContainers |
| Knowledge Galaxy (3D visualization) | Very High | Three.js |
| Audio narration integration | High | TTS API |
| Hands-on lab environment | High | Terminal emulator |

**Deliverables:**
- Live code examples in docs
- Visual knowledge exploration
- Multi-modal learning options

### Phase 6: Content Creation (Weeks 15-16)
**AI Writing & Collaboration**

| Task | Complexity | Dependencies |
|------|------------|--------------|
| Smart content creation assistant | High | Claude API |
| Template engine with domain templates | Medium | None |
| Style guide enforcement | Medium | None |
| Collaborative real-time editor | Very High | WebSocket/Yjs |

**Deliverables:**
- AI-assisted content creation
- Consistent style across wiki
- Real-time collaboration

---

## Part V: Critical Files Reference

### Navigation
- `/wiki/claude-code/_meta.json` (create)
- `/components/navigation/MobileNav.tsx` (update)

### Content Discovery
- `/api/src/services/collectors/github-trending.ts` (create)
- `/api/src/services/collectors/twitter-discovery.ts` (create)
- `/api/src/services/collectors/content-aggregator.ts` (create)
- `/api/src/services/content-discovery.ts` (create)
- `/.github/workflows/content-discovery.yml` (create)

### Enhanced Ingestion
- `/api/src/services/deduplication.ts` (create)
- `/api/src/services/source-reliability.ts` (create)
- `/api/src/services/categorization.ts` (create)
- `/api/src/db/migrations/007_enhanced_ingestion.sql` (create)

### AI Features
- `/components/ai/AIAssistant.tsx` (create)
- `/components/ai/ChatInterface.tsx` (create)
- `/api/src/services/semantic-search.ts` (create)
- `/api/src/services/learning-path-engine.ts` (create)

### Interactive Content
- `/components/code/InteractiveCodeBlock.tsx` (create)
- `/components/visualization/KnowledgeGalaxy.tsx` (create)
- `/lib/markdown/rehype-progressive-disclosure.ts` (create)

### Quality & Creation
- `/api/src/services/content-quality.ts` (create)
- `/api/src/services/content-assistant.ts` (create)
- `/api/src/services/style-enforcer.ts` (create)

---

## Part VI: Success Metrics

### Immediate (Phase 1-2)
- Claude Code navbar: 100% accessibility
- Deduplication accuracy: >90%
- Search relevance improvement: >30%

### Short-term (Phase 3-4)
- Weekly automated discovery: >50 items
- AI assistant usage: >20% of sessions
- Content quality score: >0.8 average

### Medium-term (Phase 5-6)
- Interactive examples engagement: >40%
- Learning path completion: >60%
- Knowledge Galaxy usage: >15% of users

### Long-term
- User comprehension improvement: >25%
- Content contribution rate: 3x increase
- Time to find information: 50% reduction

---

## Conclusion

This master plan transforms Entropy-Wiki from a documentation repository into an intelligent learning platform that:

1. **Automates content discovery** - no more manual curation
2. **Understands user intent** - finds what you need, not just what you search
3. **Adapts to skill level** - serves beginners and experts equally
4. **Enables multi-modal learning** - text, video, audio, hands-on
5. **Personalizes journeys** - guided paths to your specific goals
6. **Maintains quality** - self-healing, self-improving content
7. **Accelerates creation** - AI-assisted authoring with style consistency

The implementation is structured for incremental value delivery, with each phase building on the previous while providing standalone benefits. The foundation phases can be completed quickly, while transformative features are developed in parallel tracks.
