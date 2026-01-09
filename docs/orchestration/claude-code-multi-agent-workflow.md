# Beads + Claude Code: Multi-Agent Workflow Architecture

> **VER**: 1.0.0
> **STATUS**: Production
> **LAST_UPDATED**: 2026-01-08

## Question
How should we coordinate terminal (bd CLI) and Claude Code when working through epics? One agent per epic, or multiple agents per epic?

---

## Answer: Multiple Agents Per Epic (Dependency-Driven Parallelism)

Beads is **explicitly designed for multi-session AI agent workflows** where:
- **Multiple Claude Code agents work in parallel** on different tasks within the same epic
- **Terminal serves as coordination point** for planning and monitoring
- **Dependencies define execution order**, not manual sequencing
- **Context survives across sessions** via git-backed persistence

---

## Core Design Philosophy

> **"Beads is a git-backed issue tracking system designed for AI agents to maintain context across conversation sessions, manage dependencies, and coordinate complex multi-session work."**
>
> — `/docs/beads/README.md`

### Key Principle: Persistence Over Optimization
- When in doubt, track it in beads
- Conversations are **ephemeral**, beads are **eternal**
- Context recovery is automatic via `bd prime`
- Sessions can start, stop, compact, and resume without losing work

---

## Workflow Pattern: One Issue Per Agent, Multiple Agents Per Epic

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│           Terminal (Human/Operator)                  │
│  - Run bd commands to plan, monitor, coordinate     │
│  - bd create, bd ready, bd stats, bd show           │
└───────────────┬─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│          .beads/ (Git-Backed Persistence)           │
│  - issues.jsonl (source of truth)                   │
│  - Auto-synced by daemon (commit/push/pull)         │
└───────────────┬─────────────────────────────────────┘
                │
      ┌─────────┴─────────┬──────────┬──────────┐
      ▼                   ▼          ▼          ▼
┌──────────┐       ┌──────────┐  ┌──────────┐  ...
│ Agent A  │       │ Agent B  │  │ Agent C  │
│ Session  │       │ Session  │  │ Session  │
│          │       │          │  │          │
│ Claims   │       │ Claims   │  │ Claims   │
│ Task 1   │       │ Task 2   │  │ Task 3   │
│          │       │          │  │          │
│ Works    │       │ Works    │  │ Works    │
│ Closes   │       │ Closes   │  │ Closes   │
│ Syncs    │       │ Syncs    │  │ Syncs    │
└──────────┘       └──────────┘  └──────────┘
```

### The Pattern

**1. Planning Phase (Terminal)**
```bash
# Create epic
bd create --title="User Authentication System" --type=epic --priority=1

# Break into parallel tasks (spawn subagents for creation)
bd create --title="Design auth schema" --type=task --priority=2
bd create --title="Implement JWT tokens" --type=task --priority=2
bd create --title="Add login endpoint" --type=task --priority=2
bd create --title="Add registration endpoint" --type=task --priority=2
bd create --title="Write auth tests" --type=task --priority=2

# Set up dependency graph
# Epic depends on all tasks (Epic is blocked until all tasks complete)
bd dep add <epic-id> <task1-id>
bd dep add <epic-id> <task2-id>
bd dep add <epic-id> <task3-id>
bd dep add <epic-id> <task4-id>
bd dep add <epic-id> <task5-id>

# Some tasks depend on others (sequential constraints)
bd dep add <task3-login> <task1-schema>      # Login needs schema first
bd dep add <task4-register> <task1-schema>   # Register needs schema first
bd dep add <task5-tests> <task3-login>       # Tests need login first
bd dep add <task5-tests> <task4-register>    # Tests need register first

# Check what's ready to work
bd ready
# Output shows:
# - beads-task1 (schema) - head node, no blockers
# - beads-task2 (JWT) - head node, no blockers
```

**2. Execution Phase (Claude Code Agents)**

Launch **multiple Claude Code sessions** to work in parallel:

**Agent A (Claude Code Session 1)**:
```bash
bd ready
# > beads-task1: Design auth schema [P2 - open]
# > beads-task2: Implement JWT tokens [P2 - open]

bd update beads-task1 --status=in_progress
# Work on schema design
# Write schema files
bd comments beads-task1 --add="Created users table, roles table, sessions table"
bd close beads-task1
# Daemon auto-syncs to git
```

**Agent B (Claude Code Session 2)** - Running in parallel:
```bash
bd ready
# > beads-task2: Implement JWT tokens [P2 - open]

bd update beads-task2 --status=in_progress
# Work on JWT implementation
# Write JWT utilities
bd comments beads-task2 --add="Implemented sign, verify, refresh token logic"
bd close beads-task2
# Daemon auto-syncs to git
```

**3. Monitoring Phase (Terminal)**
```bash
# Check overall progress
bd stats
# Open: 3, In Progress: 0, Closed: 2

# What's ready now?
bd ready
# > beads-task3: Add login endpoint [P2 - open]
# > beads-task4: Add registration endpoint [P2 - open]
# (Both now unblocked because schema is complete)

# What's still blocked?
bd blocked
# > beads-task5: Write auth tests [P2 - open]
#   Blocked by: beads-task3, beads-task4
```

**4. Next Wave of Agents**

Launch new agents to work on newly unblocked tasks:

**Agent C** works on `beads-task3` (login)
**Agent D** works on `beads-task4` (registration)

**5. Final Task**

When tasks 3 and 4 close:
**Agent E** works on `beads-task5` (tests)

When all tasks close, epic auto-unblocks:
**Agent F** (or return to terminal) closes the epic:
```bash
bd close <epic-id> --reason="All authentication tasks complete, system functional"
```

---

## Context Recovery: Sessions Can Start/Stop Safely

### Scenario: Agent Session Gets Compacted

**Before Compaction**:
```
Agent working on beads-task3 (login endpoint)
- Made progress on route handler
- Conversation history: 50 messages
```

**After Compaction**:
```
Conversation history lost, but:
1. Issue status preserved in .beads/issues.jsonl
2. Comments captured: "Added POST /login route, validates credentials"
3. Code changes committed to git
```

**New Session**:
```bash
# Auto-recovery via hooks
# bd prime runs automatically when .beads/ detected

# Manual check
bd list --status=in_progress
# > beads-task3: Add login endpoint [P2 - in_progress]

bd show beads-task3
# Shows: Status, priority, dependencies, comments

bd comments beads-task3
# > "Added POST /login route, validates credentials"
# > "TODO: Add rate limiting, error handling"

# Agent has full context, continues work
```

**Key Insight**: Context lives in git-backed beads, not in chat history.

---

## Best Practices for Epic Execution

### 1. One Issue Per Agent (Exclusive Focus)

From `/docs/beads/lifecycle.md`:
```
Single Focus: Keep only one issue `in_progress` at a time
```

**Why**: Prevents context thrashing, ensures clean state transitions.

**How**:
- Each Claude Code session claims ONE issue: `bd update <id> --status=in_progress`
- Works on it exclusively
- Closes it before claiming another
- Session can end after completing any single issue

### 2. Trust PageRank (Dependency-Driven Priority)

From `/docs/beads/dependencies.md`:
```
The system uses PageRank (not static priority) to determine work order.
Issues that unblock many other issues get higher priority.
bd ready surfaces these automatically.
```

**Why**: Critical path emerges automatically from dependency graph.

**How**:
- Don't manually reorder tasks
- Use `bd ready` to see what's available
- PageRank handles priority surfacing
- Blocking cascade updates automatically when issues close

### 3. Parallel Creation (Use Subagents)

From `/docs/beads/workflows.md`:
```
Break down into tasks (use parallel subagents for efficiency)
```

**Why**: Creating 10 issues manually is slow.

**How**:
- Use Task tool with multiple parallel calls
- Or use terminal with bash loops
- Create all tasks upfront, then add dependencies

### 4. Close in Batches (Efficiency)

From `/docs/beads/lifecycle.md`:
```
Close in Batches: Use `bd close <id1> <id2> ...` for efficiency
```

**Why**: Single sync instead of multiple.

**How**:
```bash
# After completing multiple tasks
bd close beads-task1 beads-task2 beads-task3
# All closed in one operation, single sync
```

### 5. Session Completion Protocol (CRITICAL)

From `/AGENTS.md` - **MANDATORY BEFORE ENDING SESSION**:

```bash
# 1. File issues for remaining work
bd create --title="..." --type=task

# 2. Run quality gates
npm test
npm run lint
npm run build

# 3. Update issue status
bd close <completed-ids>

# 4. PUSH TO REMOTE (CRITICAL)
git pull --rebase
bd sync  # Daemon auto-syncs, but verify
git push
git status  # MUST show "up to date with origin"

# 5. Clean up
# Remove stale branches, prune if needed

# 6. Verify
git log --oneline -5  # Check commits
bd stats               # Check issue state
```

**Why**: Ensures all work is preserved for next session.

---

## When to Use Multiple Agents vs Single Agent

### Multiple Agents Per Epic (Recommended)

**Use when**:
- Epic has 3+ independent tasks
- Tasks can be done in parallel (no blocking dependencies)
- You want faster completion
- Tasks are isolated (different files/systems)

**Example**:
- Epic: "Build dashboard"
- Task 1: Create data API (Agent A)
- Task 2: Build chart components (Agent B)
- Task 3: Design layout (Agent C)
- Tasks 1, 2, 3 are independent → 3 agents work simultaneously

**Coordination**:
- Terminal monitors: `bd stats`, `bd ready`, `bd blocked`
- Agents don't coordinate directly
- Git + daemon handle sync
- Dependencies prevent conflicts

### Single Agent Per Epic

**Use when**:
- Epic has 2-3 tightly coupled tasks
- Tasks MUST be done sequentially (strong dependencies)
- Context must be maintained across tasks
- Epic is small (< 4 hours total)

**Example**:
- Epic: "Fix critical bug"
- Task 1: Investigate root cause → Task 2: Write fix → Task 3: Add test
- Tasks are sequential → 1 agent works through them

**Execution**:
```bash
bd update task1 --status=in_progress
# ... work ...
bd close task1

bd update task2 --status=in_progress
# ... work ...
bd close task2

bd update task3 --status=in_progress
# ... work ...
bd close task3

bd close epic-id
```

---

## Terminal Commands for Epic Coordination

### Planning Phase
```bash
# Create epic and tasks
bd create --title="Epic" --type=epic --priority=1
bd create --title="Task 1" --type=task --priority=2
bd create --title="Task 2" --type=task --priority=2
# ...

# Set up dependencies
bd dep add <task2> <task1>  # Task 2 depends on Task 1
bd dep add <task3> <task2>  # Task 3 depends on Task 2
bd dep add <epic> <task1>   # Epic depends on all tasks
bd dep add <epic> <task2>
bd dep add <epic> <task3>
```

### Monitoring Phase
```bash
# What's ready to work on?
bd ready

# What's actively being worked?
bd list --status=in_progress

# What's blocked?
bd blocked

# Overall progress
bd stats

# Detailed view of specific issue
bd show <issue-id>

# Check comments/context
bd comments <issue-id>
```

### Coordination Phase
```bash
# Review dependency graph
bd show <epic-id>
# Shows: Blocks (X), Blocked by (Y)

# Check if unblocking happened
bd ready
# Should show newly unblocked tasks after closing a blocker
```

---

## Context Recovery Commands

### Automatic Recovery (Via Hooks)
```bash
# Happens automatically when starting new session with .beads/ present
# Hook runs: bd prime
```

### Manual Recovery
```bash
# After conversation compaction or /clear
bd prime

# Check active work
bd list --status=in_progress

# Review specific issue
bd show <issue-id>

# Read comments for context
bd comments <issue-id>

# Continue work
bd update <issue-id> --status=in_progress
# ... work ...
bd close <issue-id>
```

### Recovery After Long Break
```bash
# What was I working on?
bd list --status=in_progress

# What's the big picture?
bd stats

# What's ready to work on now?
bd ready

# Review specific epic
bd show <epic-id>

# Check dependencies
bd show <epic-id> | grep "Blocks\|Blocked by"
```

---

## Daemon Auto-Sync (No Manual Coordination Needed)

From `.beads/config.yaml`:
```yaml
daemon:
  enabled: true
  auto-sync:
    enabled: true
    interval: 300  # 5 minutes
    auto-commit: true
    auto-push: true
    auto-pull: true
```

**What This Means**:
- Daemon watches .beads/ directory
- Auto-commits changes every 5 minutes
- Auto-pushes to remote
- Auto-pulls remote changes
- Multiple agents stay synchronized without manual intervention

**You Don't Need To**:
- Run `bd sync` manually (daemon does it)
- Coordinate between agent sessions
- Worry about conflicts (git handles it)

**You Should**:
- Verify sync at session end: `git status`
- Push manually before ending: `git push`
- Pull at session start: `git pull`

---

## Workflow Decision Tree

```
START: New Epic
    ↓
Q: Can tasks be done in parallel?
    ↓                           ↓
   YES                         NO
    ↓                           ↓
Q: Are there 3+ tasks?      Single Agent
    ↓         ↓               Sequential
   YES       NO                Execution
    ↓         ↓
Multiple   Single
Agents     Agent
Parallel   Sequential
```

### Decision Factors

**Go Multiple Agents When**:
- ✅ 3+ independent tasks
- ✅ Tasks touch different files/systems
- ✅ Speed is important
- ✅ Team has multiple developers/agents
- ✅ Dependencies form clear phases (graph has multiple heads)

**Go Single Agent When**:
- ✅ 2-3 tightly coupled tasks
- ✅ Tasks require continuous context
- ✅ Strong sequential dependencies (chain graph)
- ✅ Small epic (< 4 hours)
- ✅ Context switching cost high

---

## Summary: Best Practice Pattern

### Terminal Role
- Monitor progress: `bd stats`, `bd ready`
- Review closed tasks: `bd list --status=closed`
- Verify quality: Run tests, check builds
- Coordinate handoffs between agents

### Agent Role
- Claim ONE issue at a time
- Work exclusively on that issue
- Update with comments as progress is made
- Close when complete
- Let next agent pick up next ready task

### Daemon Role
- Auto-sync between agents
- Keep git state synchronized
- Handle conflicts automatically
- Provide persistent storage

---

## Related Documentation

- [Beads Workflows](/docs/beads/workflows.md) - Multi-session patterns
- [Beads Lifecycle](/docs/beads/lifecycle.md) - State machine and single-focus rule
- [Beads Dependencies](/docs/beads/dependencies.md) - PageRank and blocking logic
- [Beads CLI Reference](/docs/beads/cli-reference.md) - Complete CLI reference
- [AGENTS.md](/AGENTS.md) - Session completion protocol
- [.beads/config.yaml](/.beads/config.yaml) - Daemon auto-sync configuration

---

## Quick Reference Card

| Phase | Command | Purpose |
|-------|---------|---------|
| **Planning** | `bd create --title="..." --type=epic` | Create epic |
| | `bd create --title="..." --type=task` | Create tasks |
| | `bd dep add <task> <blocker>` | Set dependencies |
| **Execution** | `bd ready` | Find unblocked work |
| | `bd update <id> --status=in_progress` | Claim issue |
| | `bd comments <id> --add="..."` | Document progress |
| | `bd close <id>` | Complete issue |
| **Monitoring** | `bd stats` | Overall progress |
| | `bd list --status=in_progress` | Active work |
| | `bd blocked` | Blocked issues |
| | `bd show <id>` | Issue details |
| **Recovery** | `bd prime` | Restore context |
| | `bd comments <id>` | Read progress notes |

---

**Key Takeaway**: Beads is designed for ephemeral agent sessions coordinated through git-backed persistence. Multiple agents work in parallel on dependency-driven task graphs, with terminal serving as the coordination point.
