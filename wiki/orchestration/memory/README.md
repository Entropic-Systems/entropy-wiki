# Memory

AI agents forget everything when they restart. Memory systems solve this - they give agents persistent context across sessions.

## Why Memory Matters

Without memory, every new session starts from zero:
- "What was I working on?"
- "What decisions did I make?"
- "What's blocking me?"

With memory, agents can:
- Pick up where they left off
- Track multi-session projects
- Coordinate with other agents

## Beads: The Memory System

[Beads](./beads) is a git-backed issue tracking system designed for AI agents. Think of it as "GitHub Issues meets AI-native workflows."

### Key Features

- **Persistent** - Survives session restarts
- **Git-backed** - History and sync built-in
- **Dependency-aware** - Tracks blockers and dependencies
- **AI-optimized** - Designed for agent workflows

### Quick Example

```bash
# See what's ready to work on
bd ready

# Show issue details
bd show entropy-wiki-8j5

# Claim work
bd update entropy-wiki-8j5 --status=in_progress

# Mark complete
bd close entropy-wiki-8j5
```

## Memory in Orchestration

Memory enables key orchestration patterns:

### Context Recovery
After a session restart or compaction:
```bash
bd prime  # Reload context from beads
```

### Work Distribution
Agents can check what needs doing:
```bash
bd ready  # Show unblocked tasks
```

### Progress Tracking
Supervisors can monitor:
```bash
bd stats  # Project overview
bd list --status=in_progress  # Active work
```

## Learn More

- [Beads](./beads) - Complete bead system documentation
- [CLI Reference](./cli-reference) - All bd commands
- [Dependencies](./dependencies) - How blocking works
- [Workflows](./workflows) - Common patterns
