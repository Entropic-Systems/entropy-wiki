# entropy-wiki

> [!NOTE]
> Entropy is the raw chaos of real systems. We capture it, compress it, and ship it as repeatable advantage.

## Mission
Build a cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets. High-signal, plug-and-play, and deployable via Nextra/Next.js.

## Quick Start

### View the Wiki (Development Mode)

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Visit the wiki
open http://localhost:3000
```

The wiki runs on **Nextra 4** (Next.js 15 + MDX). All documentation in `docs/` is automatically available via symlinked pages.

### Build for Production

```bash
# Build static site
npm run build

# Start production server
npm start
```

### Update Navigation

After adding new markdown files:

```bash
npm run gen-meta
```

This auto-generates `_meta.json` files for Nextra navigation.

## Architecture
- `docs/beads/`: Atomic logic snippets and issue tracking system
- `docs/gastown/`: Multi-agent orchestration and rig standards
- `docs/skills-bank/`: Functional capabilities
- `docs/prompt-bank/`: Categorized, high-performance prompts
- `docs/tooling-mcp/`: MCP server configs, custom tool definitions, API bridge logic
- `docs/orchestration/`: Multi-agent handoff protocols and state-management
- `docs/context/`: MAP.md strategies, context pruning, token saving
- `docs/lab/`: Learnings, failure logs, model-specific quirks

> [!TIP]
> Keep entries short, dense, and operational. If a file can't be executed, it should at least be copy-pastable.

> [!CAUTION]
> Avoid fluff. Every line should either increase capability or reduce ambiguity.
