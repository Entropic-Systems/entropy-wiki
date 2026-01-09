# Beads Repository Reference

## Project Overview

**Beads** is a distributed, git-backed graph issue tracker designed specifically for AI agents. The repository describes it as providing "persistent, structured memory for coding agents" by replacing unstructured markdown plans with a dependency-aware graph structure that helps agents maintain context during long-horizon tasks.

The project is licensed under MIT and currently has 9.3k stars on GitHub.

## Purpose & Core Value

Beads addresses a key limitation in agent workflows: maintaining coherent task state across extended interactions. Rather than agents losing context in long conversations, Beads stores issues as JSONL files in a `.beads/` directory, enabling version control integration and multi-agent coordination.

## Quick Start

```bash
# Install (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Initialize (Humans run this once)
bd init

# Tell your agent
echo "Use 'bd' for task tracking" >> AGENTS.md
```

## Installation Methods

Three primary installation paths are available:

- **npm:** `npm install -g @beads/bd`
- **Homebrew:** `brew install steveyegge/beads/bd`
- **Go:** `go install github.com/steveyegge/beads/cmd/bd@latest`

## Supported Platforms
- Linux (glibc 2.32+)
- macOS
- Windows

## Key Features

1. **Git-Backed Storage:** Issues stored as JSONL, versioned and merged like code
2. **Agent-Optimized:** JSON output with dependency tracking and auto-ready detection
3. **Hash-Based IDs:** Format like `bd-a1b2` prevents merge conflicts across parallel workflows
4. **Local Caching:** SQLite cache with background daemon for performance
5. **Memory Compaction:** Semantic summarization of closed tasks preserves context window

## Essential Commands

| Command | Purpose |
|---------|---------|
| `bd ready` | Lists tasks with no open blockers |
| `bd ready --json` | JSON output for agent consumption |
| `bd create "Title" -p 0` | Creates priority-0 task |
| `bd dep add <child> <parent>` | Links tasks with dependencies |
| `bd show <id>` | Displays task details and audit trail |

## Hierarchical ID Structure

Beads supports nested task organization:
- `bd-a3f8` (Epic level)
- `bd-a3f8.1` (Task level)
- `bd-a3f8.1.1` (Sub-task level)

## Setup & Configuration

Initial setup requires one human action:

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Initialize
bd init

# Document agent capability
echo "Use 'bd' for task tracking" >> AGENTS.md
```

**Stealth Mode** option (`bd init --stealth`) allows local usage without committing files to the main repository—useful for shared projects where you want personal task tracking.

## Technical Stack

- **Primary Language:** Go (94.2% of codebase)
- **Secondary Languages:** Python (4.1%), Shell (1.2%), JavaScript (0.3%)
- **Architecture:** Distributed, with git integration at core
- **Data Format:** JSONL (JSON Lines) for issue storage

## Community & Documentation

The project maintains extensive documentation:
- [Installing](https://github.com/steveyegge/beads/blob/main/docs/INSTALLING.md)
- [Agent Workflow](https://github.com/steveyegge/beads/blob/main/AGENT_INSTRUCTIONS.md)
- [Sync Branch Mode / Protected Branches](https://github.com/steveyegge/beads/blob/main/docs/PROTECTED_BRANCHES.md)
- [Troubleshooting](https://github.com/steveyegge/beads/blob/main/docs/TROUBLESHOOTING.md)
- [FAQ](https://github.com/steveyegge/beads/blob/main/docs/FAQ.md)
- [Ask DeepWiki](https://deepwiki.com/steveyegge/beads) - Q&A assistance

Community tools are cataloged in [COMMUNITY_TOOLS.md](https://github.com/steveyegge/beads/blob/main/docs/COMMUNITY_TOOLS.md), including third-party UIs, editor extensions, terminal interfaces, web UIs, and native apps.

## Notable Characteristics

- **128 contributors** to the project
- **62 releases** (as of latest data)
- Actively maintained with recent releases
- Integrations available for popular editors and development environments
- DeepWiki support for Q&A assistance

## Technical Value for Agents

The `bd ready --json` command is crucial for agents as it provides:
- Immediate next actions without hallucination
- Dependency-aware task selection
- Priority-sorted actionable items
- State that persists across context compaction

**URL:** https://github.com/steveyegge/beads
