# Claude Code Essentials for Agents

> Quick reference for key Claude Code concepts. For complete documentation, see `docs/references/ClaudeDocs/`.

## Skills

**What**: Markdown files that teach Claude how to do specific tasks

**How they work**:
1. **Discovery**: At startup, Claude loads only name + description (fast)
2. **Activation**: When request matches description, Claude asks to use Skill
3. **Execution**: Full `SKILL.md` loaded, instructions followed

**Structure**:
```yaml
---
name: skill-name
description: When to use this skill (Claude matches this to user requests)
---

Markdown instructions here...
```

**Locations**:
- Personal: `~/.claude/skills/` (all projects)
- Project: `.claude/skills/` (team-shared)
- Plugin: Provided by installed plugins

**Key insight**: Skills are **model-invoked** - Claude decides which to use based on description matching. Write descriptions with keywords users naturally say.

**Full docs**: `docs/references/ClaudeDocs/Skills-Overview.md`, `Skills-best-practices.md`

---

## Hooks

**What**: Event-driven automation that runs commands or LLM prompts at specific points in Claude's workflow

**Event types**:
- `UserPromptSubmit`: After user sends message, before Claude processes
- `PreToolUse`: Before Claude uses a tool (can block with non-zero exit)
- `PermissionRequest`: When tool requires permission (can auto-approve)
- `PostToolUse`: After tool completes
- `Stop`: When session stops
- `SubagentStop`: When subagent completes
- `SessionStart`: When session starts
- `SessionEnd`: When session ends
- `SessionStart:compact`: After conversation compaction

**Structure**:
```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",  // Regex: "Edit|Write", or "*" for all
        "hooks": [
          {
            "type": "command",      // or "prompt" for LLM evaluation
            "command": "bash-command-here",
            "timeout": 30           // optional, seconds
          }
        ]
      }
    ]
  }
}
```

**Command hooks**:
- Receive input via stdin (JSON)
- Exit 0 = success, non-zero = block/fail
- Can use `$CLAUDE_PROJECT_DIR` environment variable

**Prompt hooks** (LLM-based):
- More flexible, can make complex decisions
- Slower than command hooks
- Useful for semantic validation

**Key insight**: PreToolUse hooks can block operations by exiting non-zero. Useful for validations, file reservation checks, or policy enforcement.

**Full docs**: `docs/references/ClaudeDocs/Hooks.md`, `Hooks-how-to.md`

---

## MCP (Model Context Protocol)

**What**: Standard protocol for connecting Claude to external tools, data sources, and services

**Core concepts**:
- **Servers**: Expose tools/resources to Claude (e.g., MCP Agent Mail, database connectors)
- **Tools**: Functions Claude can call (e.g., `send_message`, `file_reservation_paths`)
- **Resources**: Read-only data sources (e.g., `resource://inbox/AgentName`)
- **Prompts**: Reusable prompt templates

**Configuration**: `.claude/settings.json` or `.claude/settings.local.json`
```json
{
  "mcpServers": {
    "server-name": {
      "command": "uvx",
      "args": ["mcp-server-package"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

**Key insight**: MCP enables agent-to-agent coordination (via Agent Mail), database access, API integrations, and more without modifying Claude Code itself.

**Full docs**: `docs/references/ClaudeDocs/MCP.md`

---

## Memory Management

**Problem**: Long conversations exceed context windows, lose critical information

**Solutions**:

### 1. Conversation Compaction
- **What**: Automatically summarizes old messages when context fills
- **When**: Triggered automatically or via `SessionStart:compact` hook
- **Best practice**: Use beads to persist critical state across compactions

### 2. Beads Integration
- **What**: Git-backed issue tracker with persistent JSONL storage
- **Why**: Survives compaction, provides structured memory
- **How**: Store task state, decisions, blockers in beads; use `bd ready` after compaction to recover context

### 3. Progressive Disclosure
- **What**: Load only what you need, when you need it
- **How**:
  - Skills load name/description first, full content on-demand
  - Use `resource://` for fast reads without tool calls
  - Query specific data instead of reading everything

**Key insight**: Treat conversation memory as ephemeral. Persist important state in beads, git, or MCP resources.

**Full docs**: `docs/references/ClaudeDocs/Memory-management.md`

---

## Subagents

**What**: Specialized Claude instances launched to handle focused tasks autonomously

**Types**:
- `Bash`: Command execution specialist
- `general-purpose`: Multi-step tasks, searching, research
- `Explore`: Fast codebase exploration
- `Plan`: Software architect for planning implementations
- Custom: Defined in plugins or project

**When to use**:
- Task requires extended autonomous work
- Need specialized capabilities (e.g., thorough codebase search)
- Want to run work in background while continuing main task

**How to launch**:
```
Use the Task tool with subagent_type parameter
```

**Key insight**: Subagents have fresh context. Use them for focused, stateless tasks. For persistent memory across subagents, use beads.

**Full docs**: `docs/references/ClaudeDocs/subagents.md`

---

## Settings Hierarchy

Settings loaded in order (later overrides earlier):
1. `~/.claude/settings.json` - User settings (all projects)
2. `.claude/settings.json` - Project settings (committed, team-shared)
3. `.claude/settings.local.json` - Local overrides (gitignored)
4. Managed policy settings (enterprise)

**Key settings**:
- `hooks`: Event-driven automation
- `mcpServers`: MCP server configurations
- `permissions`: Tool permissions (allow/deny/ask)
- `contextPolicy`: Context management rules

**Best practice**: Use `.local.json` for environment-specific config (API keys, local paths). Commit `.claude/settings.json` for team-shared config.

**Full docs**: `docs/references/ClaudeDocs/Settings.md`

---

## Plugin System

**What**: Reusable packages that add Skills, hooks, MCP servers, and settings to Claude Code

**Structure**:
```
plugin-name/
├── manifest.json          # Plugin metadata
├── skills/               # Bundled skills
├── hooks/                # Hook scripts
└── settings.json         # Plugin settings (merged with project)
```

**Installation**: Place in `~/.claude/plugins/` or `.claude/plugins/`

**Key insight**: Plugins enable sharing complete workflows. Good plugins include Skills (what to do) + Hooks (when to do it) + MCP servers (how to do it).

**Full docs**: `docs/references/ClaudeDocs/Plugin.md`, `Plugin-reference.md`

---

## Quick Decision Tree

**When to use each mechanism**:

| Goal | Use |
|------|-----|
| Teach Claude a workflow | **Skill** |
| Automate on specific events | **Hook** |
| Connect external tools/data | **MCP Server** |
| Persistent memory across sessions | **Beads** |
| Focused autonomous subtask | **Subagent** |
| Coordinate multiple agents | **MCP Agent Mail** |
| Share complete workflow | **Plugin** |

---

## Integration Pattern: Complete Workflow Example

**Scenario**: Multi-agent feature development with validation

1. **Skill**: `feature-development` teaches Claude the team's feature workflow
2. **Hook**: `PreToolUse` on Write/Edit checks MCP Agent Mail for file reservations
3. **MCP Server**: Agent Mail provides file lease system
4. **Beads**: Tracks feature tasks with dependencies
5. **Subagent**: Explore agent searches codebase for similar patterns
6. **Bead Viewer**: `bv --robot-triage` identifies highest-impact task

**Result**: Claude follows team standards (Skill), checks for conflicts (Hook + MCP), maintains persistent state (Beads), delegates research (Subagent), and prioritizes work (bv).

---

## For More Details

**Complete reference docs** (this project):
- `docs/references/ClaudeDocs/` - Official Claude Code documentation
- `docs/references/CodexDocs/` - Project-specific documentation

**Agent knowledge base** (patterns & tools):
- `docs/agent-knowledge-base/memory-state/` - Beads, Gas Town, Bead Viewer
- `docs/agent-knowledge-base/coordination/` - MCP Agent Mail
- `docs/agent-knowledge-base/loops/` - Ralph Wiggum validation loops
- `docs/agent-knowledge-base/context/` - Context engineering patterns
