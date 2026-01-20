---
title: Wiki Ingest
description: Skill for ingesting URLs and text into wiki entries
---

# Wiki Ingest

Ingest external content (URLs or text) into the entropy-wiki with automatic classification and routing.

## Usage

```bash
# URL input
/wiki-ingest https://example.com/article-about-mcp

# Text input
/wiki-ingest "The supervisor pattern in multi-agent systems..."
```

## How It Works

```
Input (URL or text)
       ↓
1. Fetch/Analyze content
       ↓
2. Classify to wiki section
       ↓
3. Search for similar entries
       ↓
4. Route decision:
   ├─ Similar entry exists → Enhance it
   ├─ Section matches, no similar → Create new in section
   └─ No section match → Create in staging/
```

## Section Classification

| Section | Content Types |
|---------|--------------|
| `claude-code` | Skills, hooks, agents, plugins, MCP |
| `orchestration` | Multi-agent, coordination, frameworks, memory, patterns |

## Decision Logic

**Enhance existing** when:
- Content has >60% overlap with existing entry
- Adds details, examples, or updates to existing topic

**Create new** when:
- Topic fits section but no similar entry exists
- Distinct subtopic warranting standalone entry

**Stage** when:
- Content doesn't clearly fit any section
- Needs manual review and organization

## Output Format

New entries include frontmatter:

```yaml
---
title: Generated Title
description: One-line summary
date: YYYY-MM-DD
source: https://original-url.com  # if from URL
ingested: true
tags: [auto, generated, tags]
---
```

## Post-Ingestion

After creating new entries:
```bash
npm run gen-meta    # Update navigation
npm run gen-search  # Update search index
```

## See Also

- [Plugins Overview](./) - All Claude Code plugins
- [Core Concepts](../core-concepts) - Skills, hooks, commands
