# Gastown Documentation

Multi-agent orchestration system for Claude Code with persistent work tracking.

## Overview

Gastown is a workspace manager that coordinates multiple AI agents working on different tasks. Instead of losing context when agents restart, Gastown persists work state in git-backed hooks, enabling reliable multi-agent workflows.

This directory contains comprehensive documentation for implementing and operating Gastown rigs.

## Documentation

### [GUPP - Gastown Unified Propulsion Protocol](./gupp.md) ⭐

**The Industrial Constitution of a Gastown Rig**

Comprehensive guide covering:
- **Philosophy of Momentum** - Core principles for continuous propulsion
- **Rig Hierarchy** - Roles from Human Overseer to Polecats
- **Coordination Patterns** - Sequential, parallel, and escalation workflows
- **Troubleshooting** - Handling "Ralph Wiggum States" (degraded agents)
- **Metrics & Health** - KPIs and monitoring procedures

**Essential reading for:**
- Human operators setting up or managing Gastown rigs
- AI agents (Mayor, Polecats) executing work
- System architects implementing multi-agent coordination

## Quick Start

```bash
# Install Gastown
go install github.com/steveyegge/gastown/cmd/gt@latest

# Create workspace
gt install ~/gt --git
cd ~/gt

# Add project
gt rig add myproject https://github.com/you/repo.git

# Create your workspace
gt crew add yourname --rig myproject
cd myproject/crew/yourname

# Start the Mayor (your main interface)
gt mayor attach
```

## Key Concepts

**The Mayor 🎩** - Your primary AI coordinator. Start here - tell the Mayor what you want to accomplish.

**Polecats 🦨** - Ephemeral worker agents that spawn, complete a task, and disappear.

**Hooks 🪝** - Git worktree-based persistent storage. Your work survives crashes and restarts.

**Convoys 🚚** - Work tracking units that bundle multiple issues/tasks.

**GUPP Philosophy** - Momentum is the default state. Idle agents represent waste.

## Integration with Beads

Gastown uses [Beads](../beads/README.md) for issue tracking and dependency management:

```bash
bd ready              # Find work with no blockers
bd show <issue-id>    # View issue details
bd update <id> --status=in_progress  # Claim work
bd close <id>         # Complete work
```

See [Beads Documentation](../beads/) for complete reference.

## Architecture

```
Human Overseer (You)
    ↓ guides
The Mayor (AI Coordinator)
    ↓ delegates
Polecats (Worker Agents)
    ↓ stores state in
Hooks (Git Worktrees)
```

## Resources

**Complete Gastown Reference:**
- `/references/gastown_readme.md` - Full CLI documentation

**Related Documentation:**
- `/docs/beads/` - Beads issue tracking system
- `/docs/orchestration/` - Multi-agent handoff protocols
- `/references/agent_mail_readme.md` - Agent communication system

## Common Workflows

### Basic Workflow
1. Tell Mayor what to build
2. Mayor creates convoy with issues
3. Mayor spawns Polecats and assigns work
4. Polecats execute, storing state in hooks
5. Mayor monitors progress
6. Mayor reports completion

### Formula-Based Workflow
```bash
# List available formulas
bd formula list

# Execute standardized process
bd cook release --var version=1.2.0
```

## Troubleshooting

**Agents losing connection?**
```bash
gt hooks list
gt hooks repair
```

**Convoy stuck?**
```bash
gt convoy refresh <convoy-id>
```

**Mayor not responding?**
```bash
gt mayor detach
gt mayor attach
```

For complete troubleshooting guide including "Ralph Wiggum States", see [GUPP documentation](./gupp.md).

## Further Reading

Start with **[GUPP](./gupp.md)** to understand the philosophy and operational patterns.

Then explore specific topics:
- Agent communication patterns
- Multi-rig coordination
- Formula development
- Custom agent presets
- Performance optimization

---

*"An agent in motion stays in motion. Keep the rigs propelled."*
