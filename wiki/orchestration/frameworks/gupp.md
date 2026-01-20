# GUPP: The Gastown Unified Propulsion Protocol

**The Industrial Constitution of a Gastown Rig**

Version 1.0 | Philosophy of Momentum for Multi-Agent Coordination

---

## Executive Summary

GUPP (Gastown Unified Propulsion Protocol) is the operational philosophy and structural framework that governs multi-agent coordination in Gastown rigs. It embodies a **philosophy of momentum**: systems should always be moving forward, agents should never be idle when work exists, and blockers must be resolved through systematic escalation and delegation.

This document serves as the industrial constitution for Gastown operations, defining:
- The Rig Hierarchy (roles and responsibilities)
- The philosophy of continuous propulsion
- Multi-agent coordination patterns
- Troubleshooting procedures for degraded states

**Target Audience:** Human operators, AI agents (Mayor, Polecats), and system architects implementing Gastown workflows.

---

## Part I: Philosophy of Momentum

### Core Principle

**Momentum is the default state.** Idle agents represent waste. Blocked work represents missed opportunity. The GUPP philosophy states that any system can be in one of three states:

1. **Propelled** - Agents actively advancing work toward completion
2. **Transitioning** - Brief coordination overhead between tasks
3. **Degraded** - Systemic issues preventing forward progress (requires intervention)

A healthy Gastown rig spends >90% of time in Propelled state, <10% in Transitioning, and approaches zero time in Degraded.

### The Five Laws of Propulsion

#### 1. The Law of Continuous Motion
**"An agent in motion stays in motion; an idle agent remains idle unless acted upon by work allocation."**

- Agents should transition immediately from completed work to new work
- The Mayor coordinates work queuing to prevent idle time
- Convoys track work pipelines to ensure continuous flow

#### 2. The Law of Explicit Blocking
**"Work is either ready, in-progress, or explicitly blocked. Ambiguity is degradation."**

- Every issue has a clear state in the Beads ledger
- Blocked work must document its blocker
- Agents never "wait to hear back" - they escalate or move to other work

#### 3. The Law of Strategic Delegation
**"Work flows downward; context flows upward."**

- Mayor delegates to Polecats
- Polecats execute and report completion
- Crew Members (humans) provide strategic direction
- Human Overseer intervenes only when propulsion fails

#### 4. The Law of Persistent State
**"Agent memory is ephemeral; hook state is eternal."**

- All work state persists in git-backed hooks
- Agents can crash, restart, or be replaced without losing context
- Hooks serve as the single source of truth

#### 5. The Law of Escalation
**"Blockers unresolved within 2 cycles must escalate."**

- Polecat → Mayor (after 2 failed attempts)
- Mayor → Human Overseer (after exhausting agent strategies)
- Human Overseer → External resources (infrastructure, APIs, humans)

---

## Part II: The Rig Hierarchy

The Gastown rig operates as a stratified system with clearly defined roles. Understanding this hierarchy is critical for effective coordination.

### Role Definitions

```
┌─────────────────────────────────────────┐
│        Human Overseer (You)              │  ← Strategic direction, emergency intervention
└─────────────────────────────────────────┘
                  ↓ guides
┌─────────────────────────────────────────┐
│        The Mayor (AI Coordinator)        │  ← Work orchestration, convoy management
└─────────────────────────────────────────┘
                  ↓ delegates
┌─────────────────────────────────────────┐
│        Polecats (Worker Agents)          │  ← Task execution, specialized work
└─────────────────────────────────────────┘
                  ↓ stores state in
┌─────────────────────────────────────────┐
│        Hooks (Git Worktrees)             │  ← Persistent storage, version control
└─────────────────────────────────────────┘
```

### 1. Human Overseer 🎩

**Identity:** You, the human operator

**Responsibilities:**
- Provide strategic direction ("build authentication system")
- Define success criteria and constraints
- Intervene when agents reach degraded states
- Make architectural decisions that require judgment
- Approve high-risk operations (deployments, deletions, etc.)

**Interface:**
- `gt mayor attach` - Primary interaction with Mayor
- Web UI `/mail/{project}/overseer/compose` - Direct agent messaging
- Convoy dashboard - Monitor progress

**Authority:**
- Can override any agent decision
- Can reassign or terminate work
- Can modify rig configuration
- Bypasses all agent contact policies

**Best Practices:**
- Let the Mayor orchestrate; intervene only when stuck
- Provide clear, unambiguous instructions
- Use convoys to track multi-issue work
- Monitor but don't micromanage

---

### 2. The Mayor (AI Coordinator) 👔

**Identity:** Primary Claude Code instance with full workspace context

**Responsibilities:**
- Break down high-level goals into actionable issues
- Create and manage convoys (work tracking units)
- Spawn Polecats and assign work via "slinging"
- Monitor progress and identify bottlenecks
- Escalate blockers to Human Overseer when necessary
- Maintain work continuity across sessions

**Interface:**
- Started via `gt mayor attach`
- Communicates via Agent Mail system
- Manages convoys: `gt convoy create`, `gt convoy list`
- Spawns agents: `gt sling <issue> <rig>`

**Authority:**
- Can create/close issues in Beads
- Can spawn/terminate Polecats
- Can modify convoy composition
- Cannot change rig configuration or high-risk operations (requires Human Overseer)

**Decision-Making:**
- Uses PageRank-based prioritization from Beads
- Considers agent availability and specialization
- Optimizes for parallelization and unblocking
- Escalates when multiple strategies fail

**Anti-Patterns:**
- Don't spawn 10 agents for trivial work (overhead exceeds benefit)
- Don't create convoys for single issues (use direct assignment)
- Don't micromanage Polecat execution (delegate and trust)

---

### 3. Crew Members (Human Workspaces) 👤

**Identity:** Individual human developer workspace within a rig

**Responsibilities:**
- Hands-on coding, debugging, and testing
- Provide domain expertise to agents
- Review agent-generated code
- Manual operations that agents cannot perform

**Interface:**
- Standard development tools (IDE, terminal, git)
- Beads CLI (`bd ready`, `bd update`, `bd close`)
- Agent Mail for receiving instructions
- Direct file system access to rig

**Authority:**
- Full git commit/push access
- Can create/close issues
- Can communicate with Mayor and Polecats
- Works alongside agents, not above them

**Coordination:**
- Check convoy status to avoid conflicts
- Use beads dependencies to sequence work
- Respond to Overseer messages promptly
- Commit and push frequently

---

### 4. Polecats (Worker Agents) 🦨

**Identity:** Ephemeral, specialized agent instances spawned by Mayor

**Responsibilities:**
- Execute specific, scoped tasks
- Store work state in hooks
- Report completion or blockers to Mayor
- Request clarification when requirements unclear

**Lifecycle:**
```
Spawned → Assigned → Working → Completed/Blocked → Terminated
         ↑                                         ↓
         └─────────── (can be reassigned) ────────┘
```

**Interface:**
- Invoked via `gt sling <issue> <rig>`
- Optional runtime override: `gt sling <issue> <rig> --agent cursor`
- Communicates via Agent Mail
- Reads/writes to hooks (git worktrees)

**Specialization:**
Available agent presets:
- `claude` - General-purpose, strong reasoning
- `gemini` - Fast iteration, good for boilerplate
- `codex` - Code-focused, testing expertise
- `cursor` - IDE integration, refactoring
- `auggie` - Augmented context, complex analysis
- `amp` - Amplified capabilities, research-heavy tasks

**Authority:**
- Can read/write files in rig
- Can commit to hooks (work state)
- Can create issues for discovered work
- Cannot modify convoy structure or spawn other agents

**Best Practices:**
- Focus on assigned issue, don't drift to related work
- Document blockers explicitly in beads comments
- Commit to hooks frequently (every meaningful state change)
- Report completion promptly to unblock downstream work

**Anti-Patterns:**
- Don't wait indefinitely for external resources (escalate after 2 attempts)
- Don't modify files outside assigned scope (creates conflicts)
- Don't create sub-tasks without Mayor approval (breaks tracking)

---

### 5. Hooks (Persistent Storage) 🪝

**Identity:** Git worktree-backed storage mechanism

**Responsibilities:**
- Persist agent work state across crashes
- Provide version control for all agent operations
- Enable rollback to any previous state
- Coordinate multi-agent access to shared state

**Structure:**
```
rig/
├── .git/              # Main repository
├── crew/              # Human workspaces
│   └── yourname/      # Your working directory
└── hooks/             # Agent persistent storage
    ├── polecat-1/     # Git worktree for agent 1
    ├── polecat-2/     # Git worktree for agent 2
    └── mayor/         # Git worktree for Mayor
```

**Lifecycle:**
1. **Created** - Mayor spawns agent, hook initialized
2. **Active** - Agent reads/writes state continuously
3. **Suspended** - Agent paused but state preserved
4. **Archived** - Work complete, hook can be cleaned up

**Version Control:**
- Every state change committed to git automatically
- Full audit trail of agent operations
- Can revert any agent decision
- Shared across rig via git remote

**Access Patterns:**
- Agents write to their own hooks (isolated namespaces)
- Mayor reads all hooks (coordination view)
- Humans can inspect hooks (debugging, auditing)

**Maintenance:**
- Hooks auto-cleanup after configurable timeout
- Use `gt hooks list` to view active hooks
- Use `gt hooks repair` to fix corruption

---

## Part III: Coordination Patterns

### Pattern 1: Sequential Dependency Chain

**Scenario:** Feature requires multiple sequential steps

**GUPP Implementation:**
```bash
# Mayor creates issues with dependencies
bd create --title="1. Database schema" --type=task
bd create --title="2. API endpoints" --type=task
bd create --title="3. Frontend UI" --type=task

bd dep add beads-002 beads-001  # 2 depends on 1
bd dep add beads-003 beads-002  # 3 depends on 2

# Create convoy
gt convoy create "Feature X" beads-001 beads-002 beads-003

# Sling first task
gt sling beads-001 myproject

# PageRank surfaces beads-001 as highest priority
# When Polecat completes beads-001, Mayor automatically slings beads-002
```

**Momentum Preservation:**
- No idle time between steps
- Mayor monitors completion and slings next task immediately
- If Polecat blocks, Mayor reassigns or escalates

---

### Pattern 2: Parallel Workstreams

**Scenario:** Multiple independent features can progress simultaneously

**GUPP Implementation:**
```bash
# Mayor creates parallel work
bd create --title="Feature A" --type=feature
bd create --title="Feature B" --type=feature
bd create --title="Feature C" --type=feature

# No dependencies between A, B, C
gt convoy create "Q1 Features" beads-A beads-B beads-C

# Sling to different agents in parallel
gt sling beads-A myproject --agent claude
gt sling beads-B myproject --agent codex
gt sling beads-C myproject --agent cursor

# All three Polecats work simultaneously
# Mayor monitors all three streams
```

**Momentum Preservation:**
- Maximize parallelization
- Different agents avoid conflicts by working on separate features
- Convoy provides unified progress view

---

### Pattern 3: Fan-Out Unblocking

**Scenario:** One foundational task blocks many downstream tasks

**GUPP Implementation:**
```bash
# Critical blocker identified
bd create --title="Provision Redis cluster" --type=task --priority=0

# Many tasks depend on it
bd dep add beads-caching beads-redis
bd dep add beads-sessions beads-redis
bd dep add beads-pubsub beads-redis

# PageRank automatically surfaces beads-redis as highest priority
bd ready
# → Shows beads-redis at top

# Mayor assigns highest-capability agent
gt sling beads-redis myproject --agent auggie

# When complete, all three downstream tasks become unblocked
# Mayor immediately slings them to available agents
```

**Momentum Preservation:**
- PageRank identifies bottlenecks automatically
- High-priority blocker gets best agent
- Downstream work queued and ready to launch on completion

---

### Pattern 4: Escalation Workflow

**Scenario:** Polecat encounters blocker it cannot resolve

**GUPP Implementation:**
```bash
# Polecat attempts resolution (Attempt 1)
# Fails - documents in beads comment

bd comments beads-123 --add="Attempt 1: API key not found in environment"

# Polecat attempts alternative strategy (Attempt 2)
# Fails - documents again

bd comments beads-123 --add="Attempt 2: Tried fallback config, still missing credentials"

# After 2 failed attempts, Polecat marks blocked and escalates to Mayor

bd update beads-123 --status=blocked
# Mayor receives escalation via Agent Mail

# Mayor analyzes options:
# Option A: Create infrastructure issue for credentials
# Option B: Escalate to Human Overseer

# Mayor chooses Option A
bd create --title="Provision API credentials" --type=task --priority=1
bd dep add beads-123 beads-infra

# Mayor messages Human Overseer via Agent Mail
# "Need API credentials provisioned for beads-123"

# Human Overseer provisions credentials
# Marks infrastructure issue complete
bd close beads-infra

# beads-123 auto-unblocks, Mayor re-slings to Polecat
```

**Momentum Preservation:**
- Polecat doesn't wait indefinitely
- Escalation happens after 2 attempts (configurable)
- Mayor converts blocker into actionable work
- Human Overseer intervened only when required

---

## Part IV: Troubleshooting Ralph Wiggum States

**"Ralph Wiggum State"** - Named after the Simpsons character, this refers to an agent that is confused, stuck, or producing nonsensical output. These degraded states require diagnosis and intervention.

### Symptoms of Ralph Wiggum States

1. **Infinite Loop** - Agent repeats same action expecting different results
2. **Context Confusion** - Agent loses track of what it's working on
3. **Hallucinated Commands** - Agent invents CLI flags or APIs that don't exist
4. **Scope Creep** - Agent drifts from assigned issue to unrelated work
5. **Zombie State** - Agent appears active but produces no meaningful output
6. **Contradiction Loop** - Agent's actions contradict its own statements

---

### Diagnostic Procedure

#### Step 1: Identify the Degraded Agent

**Symptoms visible to Mayor:**
- Polecat has not committed to hook in >30 minutes
- Polecat reports completion but work is incomplete
- Polecat sends contradictory messages
- Convoy shows issue "in_progress" but no git activity

**Commands:**
```bash
gt agents                    # Check agent status
gt convoy show <convoy-id>   # Check convoy progress
gt hooks list                # Check hook activity

# Inspect hook state
cd myproject/hooks/polecat-X
git log --oneline | head -20
```

#### Step 2: Determine Root Cause

| Symptom | Likely Cause | Evidence |
|---------|--------------|----------|
| No commits in 30+ min | Infinite loop or waiting | Hook git log shows no recent activity |
| Repeated failed attempts | Missing information or capability | Beads comments show same error repeatedly |
| Contradictory messages | Context window exceeded | Agent references work it didn't do |
| Hallucinated commands | Insufficient reference material | Commands don't match CLI docs |
| Scope creep | Ambiguous issue description | Hook commits span multiple unrelated files |

#### Step 3: Intervention Strategy

Choose intervention based on root cause:

##### A. Soft Reset (Context Refresh)

**Use when:** Agent confused but not broken

```bash
# Mayor sends clarifying message via Agent Mail
# Provides explicit, unambiguous instructions
# References specific files, line numbers, commands

# Example message:
"""
Your task is beads-123: "Add login endpoint"

Current status: You've created auth.py but the endpoint is not yet functional.

Next steps:
1. Open src/api/auth.py
2. Implement POST /api/login endpoint
3. Use JWT token generation from src/utils/tokens.py
4. Test with: curl -X POST http://localhost:8000/api/login -d '{"user":"test","pass":"test"}'
5. Commit and close beads-123

Do not work on registration, password reset, or other auth features. Focus only on login endpoint.
"""
```

##### B. Hard Reset (Agent Restart)

**Use when:** Agent in zombie state or infinite loop

```bash
# Terminate degraded agent
gt agent kill polecat-X

# Archive hook state
cd myproject/hooks
mv polecat-X polecat-X.degraded.$(date +%s)

# Spawn fresh agent with explicit instructions
gt sling beads-123 myproject --agent claude

# Mayor sends detailed context to new agent
```

##### C. Escalation to Human Overseer

**Use when:** Mayor exhausted strategies or issue requires human judgment

```bash
# Mayor composes escalation message
# Includes:
# - Issue ID and description
# - Attempts made
# - Why Mayor believes human intervention needed

# Human Overseer options:
# 1. Provide missing information (API keys, architectural decisions)
# 2. Clarify ambiguous requirements
# 3. Simplify scope (break into smaller issues)
# 4. Take over manually (complex refactoring, sensitive operations)
```

##### D. Issue Decomposition

**Use when:** Issue too complex or ambiguous for single agent

```bash
# Mayor breaks issue into smaller sub-issues
bd create --title="Subtask 1: ..." --type=task
bd create --title="Subtask 2: ..." --type=task
bd create --title="Subtask 3: ..." --type=task

# Link to parent
bd dep add beads-parent beads-sub1
bd dep add beads-parent beads-sub2
bd dep add beads-parent beads-sub3

# Sling sub-issues (possibly to different agents)
```

---

### Prevention: GUPP Best Practices

#### For Human Overseers

1. **Provide Clear Requirements** - Ambiguity causes Ralph Wiggum states
   - Good: "Add POST /api/login endpoint that returns JWT token"
   - Bad: "Make login work"

2. **Reference Documentation** - Ensure agents have access to specs
   - Link to `/docs/reference/` for CLI commands
   - Provide API documentation
   - Include examples

3. **Define Done** - Explicit success criteria
   - "Tests pass"
   - "Endpoint returns 200 with valid JSON"
   - "Documentation updated"

#### For Mayors

1. **Monitor Hook Activity** - Catch degraded states early
   - Check hook commits every 15 minutes
   - Alert if Polecat silent for >30 minutes

2. **Explicit Work Assignment** - Leave no room for interpretation
   - Include file paths, function names
   - Provide expected output
   - Link to examples

3. **Incremental Verification** - Don't wait until end to check quality
   - Request interim commits
   - Validate approach before full implementation

#### For Polecats

1. **Consult References** - Never guess CLI flags or API behavior
   - Check `/docs/reference/` before using `bd` commands
   - Verify file paths exist before reading/writing
   - Test assumptions

2. **Fail Fast** - Escalate after 2 failed attempts
   - Don't retry same approach 5 times
   - Document failures explicitly
   - Request Mayor guidance

3. **Stay Scoped** - Only work on assigned issue
   - Resist temptation to "fix nearby bugs"
   - Create new issues for discovered work
   - Trust Mayor to prioritize

---

## Part V: GUPP in Practice

### Example Session: Building Authentication System

```bash
# Human Overseer tells Mayor: "Build authentication system with JWT"

# --- MAYOR WORKFLOW ---

# 1. Break down into issues
bd create --title="Design auth database schema" --type=task --priority=1
bd create --title="Implement JWT token generation" --type=task --priority=1
bd create --title="Add login endpoint" --type=task --priority=1
bd create --title="Add registration endpoint" --type=task --priority=1
bd create --title="Add middleware for auth verification" --type=task --priority=1
bd create --title="Write integration tests" --type=task --priority=2
bd create --title="Update API documentation" --type=task --priority=2

# 2. Set up dependencies
bd dep add beads-003 beads-001  # Login needs schema
bd dep add beads-003 beads-002  # Login needs JWT
bd dep add beads-004 beads-001  # Registration needs schema
bd dep add beads-005 beads-002  # Middleware needs JWT
bd dep add beads-006 beads-003  # Tests need login
bd dep add beads-006 beads-004  # Tests need registration
bd dep add beads-007 beads-006  # Docs need tests passing

# 3. Create convoy
gt convoy create "Authentication System" beads-001 beads-002 beads-003 beads-004 beads-005 beads-006 beads-007 --notify --human

# 4. Check ready work (PageRank surfaces beads-001, beads-002 as unblocked)
bd ready
# Output: beads-001 (schema), beads-002 (JWT)

# 5. Sling parallel work
gt sling beads-001 myproject --agent claude  # Schema design to Claude
gt sling beads-002 myproject --agent codex   # JWT implementation to Codex

# 6. Monitor progress
gt convoy show
# Polecat-1 (Claude): beads-001 in_progress
# Polecat-2 (Codex): beads-002 in_progress

# --- POLECAT-1 WORKFLOW (Schema) ---
# Reads requirements, designs schema, creates migration
# Commits to hook: hooks/polecat-1/.git
bd close beads-001
# Terminates

# --- POLECAT-2 WORKFLOW (JWT) ---
# Implements token generation, adds tests
# Commits to hook: hooks/polecat-2/.git
bd close beads-002
# Terminates

# --- MAYOR DETECTS COMPLETION ---
# beads-001 and beads-002 closed
# PageRank recalculates: beads-003, beads-004 now unblocked

# 7. Sling next wave
bd ready
# Output: beads-003 (login), beads-004 (registration), beads-005 (middleware)

gt sling beads-003 myproject --agent claude
gt sling beads-004 myproject --agent claude
gt sling beads-005 myproject --agent codex

# Work continues in parallel...

# --- SCENARIO: POLECAT-3 ENCOUNTERS BLOCKER ---
# Polecat-3 working on beads-003 (login endpoint)
# Attempt 1: Can't find JWT secret in environment
bd comments beads-003 --add="Attempt 1: JWT_SECRET not in environment vars"

# Attempt 2: Tries to use hardcoded secret (bad practice)
bd comments beads-003 --add="Attempt 2: Hardcoded secret fails tests (rightfully)"

# Escalates after 2 attempts
bd update beads-003 --status=blocked
# Sends message to Mayor: "Blocked on JWT_SECRET configuration"

# --- MAYOR HANDLES ESCALATION ---
# Creates infrastructure issue
bd create --title="Configure JWT_SECRET in environment" --type=task --priority=0
bd dep add beads-003 beads-infra

# Escalates to Human Overseer via Agent Mail
# "beads-003 blocked. Need JWT_SECRET provisioned."

# --- HUMAN OVERSEER RESPONDS ---
# Adds JWT_SECRET to .env file
# Commits and pushes

# Marks infrastructure complete
bd close beads-infra

# beads-003 auto-unblocks

# --- MAYOR RE-SLINGS ---
gt sling beads-003 myproject --agent claude
# Polecat-4 spawned, sees JWT_SECRET available, completes work
bd close beads-003

# Cascade continues until all issues closed
# Convoy marks complete
# Mayor reports to Human Overseer: "Authentication system complete. 7 issues closed. Tests passing."
```

**GUPP Principles Demonstrated:**
1. ✅ Momentum maintained through parallel work
2. ✅ Explicit blocking and dependency tracking
3. ✅ Strategic delegation (Mayor → Polecats)
4. ✅ Persistent state in hooks (survives agent restarts)
5. ✅ Escalation after 2 failed attempts
6. ✅ Human Overseer intervention only when required

---

## Part VI: Metrics & Health Monitoring

### Key Performance Indicators (KPIs)

#### 1. Propulsion Ratio
```
Propulsion Ratio = (Time in Propelled State) / (Total Time)
```
**Target:** >0.90 (90%+ of time actively working)

**Measure:**
```bash
# Check agent activity
gt agents --verbose

# Check convoy progress rate
gt convoy show <id> --stats
```

#### 2. Escalation Rate
```
Escalation Rate = (Issues Escalated) / (Total Issues)
```
**Target:** <0.10 (less than 10% need escalation)

**High escalation rate indicates:**
- Poor issue decomposition
- Missing documentation/references
- Agent capability mismatch

#### 3. Blocker Resolution Time
```
Blocker Resolution Time = Time from status=blocked to status=in_progress
```
**Target:** <30 minutes

**Measure:**
```bash
bd list --status=blocked
# Check timestamps
```

#### 4. Hook Commit Frequency
```
Hook Commit Frequency = Commits per hour per active agent
```
**Target:** >4 commits/hour/agent (every 15 minutes)

**Low frequency indicates:**
- Agent stuck in Ralph Wiggum state
- Task too large (needs decomposition)
- Waiting on external resources

---

### Health Check Procedure

**Run weekly or when performance degrades:**

```bash
# 1. Check project statistics
bd stats

# 2. Check convoy health
gt convoy list
# Look for: stalled convoys (created >2 days ago, still open)

# 3. Check agent utilization
gt agents
# Look for: agents idle when work exists

# 4. Check blocked issues
bd blocked
# Look for: issues blocked >1 day

# 5. Check hook activity
gt hooks list
# Look for: hooks with no recent commits

# 6. Run diagnostics
gt doctor
bd doctor

# 7. Review escalation patterns
# Grep for escalations in agent mail
# High volume from same issue type = systemic problem
```

---

## Part VII: Advanced GUPP Patterns

### Pattern: Formula-Driven Workflows

**Use Beads Formulas for repeatable processes:**

```toml
# .beads/formulas/deploy.formula.toml
description = "Production deployment process"
formula = "deploy"
version = 1

[[steps]]
id = "run-tests"
title = "Run full test suite"
description = "make test"

[[steps]]
id = "build"
title = "Build production artifacts"
description = "make build"
needs = ["run-tests"]

[[steps]]
id = "deploy-staging"
title = "Deploy to staging"
description = "make deploy-staging"
needs = ["build"]

[[steps]]
id = "smoke-tests"
title = "Run smoke tests on staging"
description = "make smoke-test"
needs = ["deploy-staging"]

[[steps]]
id = "deploy-prod"
title = "Deploy to production"
description = "make deploy-prod"
needs = ["smoke-tests"]
```

**Execute:**
```bash
# Mayor runs formula
bd cook deploy

# Or create trackable instance
bd mol pour deploy
```

**GUPP Benefit:** Standardized processes reduce ambiguity, decrease Ralph Wiggum states.

---

### Pattern: Multi-Rig Coordination

**Scenario:** Feature spans multiple repositories

```bash
# Human Overseer coordinates across rigs
# Rig A: Backend API
# Rig B: Frontend UI

# Create convoy in Rig A
cd ~/gt/backend/crew/mayor
gt convoy create "API v2" beads-api-001 beads-api-002

# Create convoy in Rig B
cd ~/gt/frontend/crew/mayor
gt convoy create "UI for API v2" beads-ui-001 beads-ui-002

# Set cross-rig dependency (manual coordination)
# beads-ui-001 depends on beads-api-001 completion
# Mayor monitors both convoys
# Alerts Human Overseer when backend ready for frontend work
```

---

## Appendix A: GUPP Glossary

| Term | Definition |
|------|------------|
| **GUPP** | Gastown Unified Propulsion Protocol - the operational philosophy and hierarchy |
| **Propelled State** | System actively advancing work toward completion |
| **Transitioning State** | Brief coordination overhead between tasks |
| **Degraded State** | Systemic issues preventing forward progress |
| **Ralph Wiggum State** | Agent confused, stuck, or producing nonsensical output |
| **Momentum** | Continuous forward progress without idle time |
| **Slinging** | Assigning work to an agent (`gt sling <issue> <rig>`) |
| **Hook** | Git worktree-backed persistent storage for agent state |
| **Convoy** | Work tracking unit bundling multiple related issues |
| **Polecat** | Ephemeral worker agent spawned for specific task |
| **Mayor** | AI coordinator managing work orchestration |
| **Human Overseer** | Human operator providing strategic direction |
| **Escalation** | Passing blocker up hierarchy after failed resolution attempts |
| **PageRank** | Algorithm for prioritizing issues based on unblocking impact |

---

## Appendix B: GUPP Checklist for New Rigs

**Use this checklist when setting up a new Gastown rig:**

```bash
# Infrastructure
☐ Install prerequisites (Go, Git, tmux, Claude Code)
☐ Install gastown: go install github.com/steveyegge/gastown/cmd/gt@latest
☐ Install beads: (follow beads installation instructions)
☐ Initialize workspace: gt install ~/gt --git

# Rig Setup
☐ Add project: gt rig add <name> <repo>
☐ Create crew workspace: gt crew add <yourname> --rig <rig>
☐ Initialize beads: cd <rig> && bd init
☐ Configure daemon: bd daemon start

# Documentation
☐ Add references to /docs/reference/ (CLI docs, API specs)
☐ Create AGENTS.md with project context
☐ Document success criteria for common tasks

# Mayor Configuration
☐ Set default agent: gt config default-agent claude
☐ Configure additional agent aliases if needed
☐ Test Mayor: gt mayor attach

# Validation
☐ Create test issue: bd create --title="Test issue" --type=task
☐ Sling to agent: gt sling <test-issue> <rig>
☐ Verify hook created: gt hooks list
☐ Verify agent completes work
☐ Check convoy tracking: gt convoy list

# Health Baseline
☐ Run bd stats (establish baseline)
☐ Run gt doctor (verify no issues)
☐ Document expected propulsion ratio for this rig type
```

---

## Appendix C: Further Reading

**Gastown Documentation:**
- `/docs/reference/gastown_readme.md` - Complete Gastown reference
- `/docs/reference/agent_mail_readme.md` - Agent Mail system documentation

**Beads Documentation:**
- `/docs/beads/README.md` - Beads system manual
- `/docs/beads/lifecycle.md` - Issue lifecycle and states
- `/docs/beads/dependencies.md` - PageRank and dependency resolution
- `/docs/beads/cli-reference.md` - Complete bd command reference

**Philosophy:**
- This document (GUPP) - Industrial constitution and momentum philosophy

---

**Document Status:** Living document, version 1.0
**Maintained by:** entropy-wiki project
**Last Updated:** 2026-01-08

*"An agent in motion stays in motion. Keep the rigs propelled."*
