---
name: reference-context
description: Ensures Claude checks relevant reference documentation before starting work. Use when you need context about Claude Code features, MCP servers, Skills, Hooks, project patterns, or domain knowledge from docs/references/ or docs/agent-knowledge-base/ directories.
---

# Reference Context

Check relevant reference documentation before starting work to ensure you have accurate, up-to-date context.

## When to Use

Activate when you need context about:
- **Claude Code features**: Skills, Hooks, MCP, Subagents, Settings
- **API usage**: Anthropic API, Claude SDK patterns
- **Project patterns**: CodexDocs for project-specific conventions
- **Domain knowledge**: References directory for specialized topics
- **Framework specifics**: Next.js, React, TypeScript patterns
- **Best practices**: Authoring guides, development workflows

## Available Reference Sources

### docs/references/ - Raw Documentation

Complete reference documentation for humans and agents:

**docs/references/ClaudeDocs/** - Claude Code Documentation:
- `Skills-Overview.md` - Skills architecture, creation, usage
- `Skills-best-practices.md` - Authoring effective skills
- `Hooks.md` & `Hooks-how-to.md` - Event-driven automation
- `MCP.md` - Model Context Protocol integration
- `Plugin.md` & `Plugin-reference.md` - Plugin system
- `Settings.md` - Configuration options
- `subagents.md` - Subagent patterns
- `Memory-management.md` - Context and conversation management

**docs/references/CodexDocs/** - Project-Specific Patterns:
- Architecture decisions
- Code organization
- Team conventions
- Development workflows

### docs/agent-knowledge-base/ - Agent Patterns & Tools

Processed patterns, tools, and workflows for agents:

**Quick start**: `claude-code-essentials.md` - Key concepts from ClaudeDocs

**By category**:
- `memory-state/` - Beads, Gas Town, Beads Viewer (persistent memory systems)
- `coordination/` - MCP Agent Mail, MCP Inspector (multi-agent coordination)
- `loops/` - Ralph Wiggum patterns (validation loops)
- `context/` - Context engineering, AGENTS.md spec
- `mobile/` - Tailscale, iPhone setup

**Navigation**: `INDEX.md` - Complete guide to agent-knowledge-base resources

## Workflow

### 1. Identify What Context You Need

Before starting work, ask:
- **Am I using a Claude Code feature?** → Check docs/references/ClaudeDocs/ or docs/agent-knowledge-base/claude-code-essentials.md
- **Does this project have conventions?** → Check docs/references/CodexDocs/
- **Do I need specialized knowledge?** → Check docs/agent-knowledge-base/ (organized by category)
- **Am I implementing an integration?** → Check relevant API docs or docs/agent-knowledge-base/INDEX.md

### 2. Search for Relevant Documentation

Use progressive disclosure - start broad, then get specific:

**Step 1: Find relevant files**
```bash
# List available references
ls docs/references/ClaudeDocs/
ls docs/references/CodexDocs/
ls docs/agent-knowledge-base/
```

**Step 2: Use Glob to find specific topics**
```bash
# Example: Find Skills documentation
glob "docs/references/ClaudeDocs/*Skills*"

# Example: Find agent patterns
glob "docs/agent-knowledge-base/**/*beads*.md"

# Example: Find MCP references
glob "docs/**/*mcp*.md"
```

**Step 3: Read the relevant file**
```bash
# Read the specific documentation
Read docs/references/ClaudeDocs/Skills-Overview.md

# Or start with essentials
Read docs/agent-knowledge-base/claude-code-essentials.md
```

### 3. Extract What You Need

Don't read entire files - use progressive disclosure:

**For overview**: Read the first 100 lines
**For specific section**: Search for section heading
**For examples**: Jump to examples section

Use `offset` and `limit` parameters in Read tool for large files.

### 4. Apply Context to Your Work

After reading references:
- Follow patterns shown in documentation
- Use correct API signatures
- Apply best practices
- Avoid deprecated patterns

## Integration with Ralph Wiggum Loops

References should inform each iteration:

1. **Before starting**: Check references for approach
2. **During implementation**: Refer back to examples
3. **During validation**: Verify against best practices
4. **After completion**: Ensure compliance with standards

## Reference Checking Patterns

### Pattern 1: Feature Implementation

When implementing a Claude Code feature:

```markdown
1. Start with essentials: docs/agent-knowledge-base/claude-code-essentials.md
2. Check full docs: docs/references/ClaudeDocs/
3. Read overview to understand architecture
4. Read best practices guide
5. Review examples
6. Implement following patterns shown
```

**Example: Creating a Skill**
```bash
# 1. Quick start with essentials
Read docs/agent-knowledge-base/claude-code-essentials.md

# 2. Read full Skills overview
Read docs/references/ClaudeDocs/Skills-Overview.md

# 3. Read best practices
Read docs/references/ClaudeDocs/Skills-best-practices.md

# 4. Look at example skill
Read .claude/skills/mcp-builder/SKILL.md

# 5. Implement your skill following patterns
```

### Pattern 2: Project Conventions

When working on project code:

```markdown
1. Check docs/references/CodexDocs/ for conventions
2. Look at existing code patterns
3. Follow established structure
4. Maintain consistency
```

**Example: Adding a Component**
```bash
# 1. Check for component guidelines
glob "docs/references/CodexDocs/*component*"

# 2. Look at existing components
glob "src/components/*.tsx"

# 3. Follow existing patterns
```

### Pattern 3: Domain Research

When you need specialized knowledge:

```markdown
1. Check docs/agent-knowledge-base/INDEX.md for navigation
2. Search relevant category directory
3. Extract key information
4. Apply to your implementation
```

**Example: Setting up Beads**
```bash
# 1. Check INDEX for navigation
Read docs/agent-knowledge-base/INDEX.md

# 2. Find Beads documentation
Read docs/agent-knowledge-base/memory-state/github-beads.md

# 3. Implement following patterns
```

## Best Practices

### Progressive Disclosure

Don't load entire files upfront:

❌ **Bad**: Read all 1000 lines of documentation
✅ **Good**: Read overview, then specific sections as needed

### Combine References

Cross-reference multiple sources:
- docs/references/ClaudeDocs/ for Claude Code features
- docs/agent-knowledge-base/ for agent patterns and tools
- Official docs for frameworks
- docs/references/CodexDocs/ for project patterns

### Stay Current

References may update:
- Check file modification dates
- Look for "deprecated" warnings
- Verify examples still work

### Extract, Don't Copy

Use references as guides, not templates:
- Understand the pattern
- Adapt to your use case
- Don't blindly copy code

## Common Reference Scenarios

### Scenario: Creating a Skill

**References needed:**
1. `docs/agent-knowledge-base/claude-code-essentials.md` - Quick reference
2. `docs/references/ClaudeDocs/Skills-Overview.md` - Architecture and structure
3. `docs/references/ClaudeDocs/Skills-best-practices.md` - Authoring guidelines
4. `.claude/skills/*/SKILL.md` - Example skills

**Process:**
1. Read essentials for quick overview
2. Read full overview to understand YAML frontmatter requirements
3. Read best practices for description patterns
4. Look at examples for structure
5. Create skill following patterns

### Scenario: Setting Up MCP Server

**References needed:**
1. `docs/agent-knowledge-base/claude-code-essentials.md` - MCP basics
2. `docs/references/ClaudeDocs/MCP.md` - Full MCP integration guide
3. `.claude/skills/mcp-builder/SKILL.md` - MCP server builder skill
4. Official MCP docs (web search)

**Process:**
1. Read essentials for MCP concepts
2. Read MCP.md for integration patterns
3. Use mcp-builder skill for implementation
4. Reference official docs for specifics

### Scenario: Configuring Hooks

**References needed:**
1. `docs/agent-knowledge-base/claude-code-essentials.md` - Hooks basics
2. `docs/references/ClaudeDocs/Hooks.md` - Hook concepts
3. `docs/references/ClaudeDocs/Hooks-how-to.md` - Implementation guide
4. `.claude/hooks.json` - Existing hooks (if any)

**Process:**
1. Read essentials for hook overview
2. Read Hooks.md for event types
3. Read Hooks-how-to.md for configuration
4. Check existing hooks for patterns
5. Configure new hook

## Anti-Patterns

❌ Implementing features without checking documentation
❌ Assuming you know the API without verifying
❌ Loading entire reference files into context
❌ Ignoring project-specific conventions in docs/references/CodexDocs/
❌ Using outdated patterns from memory
❌ Skipping examples in documentation

## Quick Reference Guide

**Before implementing anything:**

```markdown
1. Is it a Claude feature? → docs/agent-knowledge-base/claude-code-essentials.md or docs/references/ClaudeDocs/
2. Is it project-specific? → docs/references/CodexDocs/
3. Is it specialized domain/tool? → docs/agent-knowledge-base/ (check INDEX.md for navigation)
4. Is it external API? → Web search + official docs
```

**Finding documentation:**

```bash
# Start with essentials
Read docs/agent-knowledge-base/claude-code-essentials.md

# List what's available
ls docs/references/ClaudeDocs/
ls docs/references/CodexDocs/
ls docs/agent-knowledge-base/

# Check INDEX for agent knowledge base navigation
Read docs/agent-knowledge-base/INDEX.md

# Find specific topics
glob "docs/**/*{topic}*.md"

# Read relevant file
Read {path}
```

**Using documentation:**

1. Read overview/intro first
2. Find relevant section
3. Extract key information
4. Apply to your work
5. Verify with examples
