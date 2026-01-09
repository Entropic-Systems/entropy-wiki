# Agent Knowledge Base - Reference Index

Quick navigation for all reference documents. These resources provide high-signal technical primitives for autonomous agents.

---

## Memory & State Primitives

Core tools for persistent, graph-based memory and industrialized agent coordination.

- **[Introducing Beads](./memory-state/steve-yegge-beads.md)** - Git-backed memory system solving "context rot" and the "Dementia Problem" ⚠️ *Manual access required (Medium blocked)*
- **[Welcome to Gas Town](./memory-state/steve-yegge-gastown.md)** - MEOW stack orchestration framework with role-based agent topology ⚠️ *Manual access required (Medium blocked)*
- **[Beads Repository](./memory-state/github-beads.md)** - Official bd CLI implementation with `bd ready --json` for agents
- **[Beads Viewer (bv)](./memory-state/github-beads-viewer.md)** - Graph analytics TUI with PageRank and critical path analysis

---

## Autonomous Loops (Ralph Wiggum Technique)

Patterns for "deterministically bad" loops that brute-force correctness via iteration.

- **[The Original Ralph Wiggum Technique](./loops/ghuntley-ralph.md)** - Core while-loop primitive and economic validation ($50k project for $297 in API costs)
- **[RepoMirror Experiment](./loops/github-repomirror.md)** - Empirical data: 6 codebases ported overnight with 1,100 commits
- **[Ralph for Claude Code](./loops/github-ralph-claude.md)** - Enterprise implementation with circuit breakers and stagnation detection
- **[Claude Code Ralph Plugin](./loops/anthropic-ralph-plugin.md)** - Official plugin with Stop Hook architecture forcing verification steps

---

## Coordination & Messaging (MCP)

Protocols for asynchronous agent-to-agent communication and resource locking.

- **[MCP Agent Mail](./coordination/github-mcp-agent-mail.md)** - Asynchronous Post Office with File Lease mutex system for multi-agent coordination
- **[MCP Inspector](./coordination/github-mcp-inspector.md)** - Debugging suite for verifying MCP server resources and prompts

---

## Context Engineering & Workflow

Optimizing token streams and managing isolated development environments.

- **[Effective Context Engineering (Anthropic)](./context/anthropic-context-engineering.md)** - Context Rot phenomenon, Context Compaction, Progressive Disclosure patterns
- **[Google ADK Architecture](./context/google-adk.md)** - "Compiled View" concept and Handle Pattern for offloading large artifacts
- **[Writing a Good CLAUDE.md](./context/humanlayer-claude-md.md)** - Keep under 300 lines, include "Physics" not history, save tokens for reasoning
- **[AGENTS.md Specification](./context/agentsmd-spec.md)** - Vendor-neutral standard for agent personas and boundaries
- **[Parallel Worktrees (par)](./context/github-par.md)** - Git worktrees + tmux for swarm development with isolated filesystems

---

## Mobile Operational Stack

"Headless Host, Mobile Client" architecture for remote orchestration.

- **[Run Claude Code from iPhone](./mobile/petesena-iphone-setup.md)** - Tailscale + Termius + tmux stack with touch event mapping ⚠️ *Manual access required (Medium blocked)*
- **[Access Desktop Session via Tailscale](./mobile/sameerhalai-tailscale.md)** - Mesh networking for "Vibe Coding" loop, bypass firewalls

---

## Quick Lookup by Use Case

### Building Persistent Memory Systems
→ Beads Repository, Beads Viewer, Introducing Beads

### Implementing Autonomous Loops
→ Ralph Wiggum Technique, RepoMirror Experiment, Ralph Plugin

### Multi-Agent Coordination
→ Gas Town, MCP Agent Mail, Parallel Worktrees

### Context Management
→ Effective Context Engineering, Google ADK, CLAUDE.md Guide

### Mobile/Remote Development
→ iPhone Setup, Tailscale Desktop Access

---

## Symbols

- ⚠️ **Manual access required** - Resource blocked by WebFetch, visit URL directly for full content
- All other resources have detailed summaries extracted and ready for agent reference

---

## Usage Notes

**For Agents:**
- Use the "Technical Value" field at the end of each reference to determine if it contains necessary primitives for your task
- References with ⚠️ symbol provide key concepts but require manual access for complete details
- All references include original URLs for source verification

**For Humans:**
- This index provides quick scanning of available resources
- Click through to individual files for detailed summaries and technical specifications
- Resources are organized by architectural layer (Memory → Loops → Coordination → Context → Mobile)

---

**Last Updated:** 2026-01-09
**Total Resources:** 19
**Categories:** 5
