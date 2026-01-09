# Rig Health Manual: Gauges and Dials

**Monitoring and Diagnostics for Gastown Rigs**

Version 1.0 | The Operator's Guide to Rig Telemetry

---

## Overview

A healthy Gastown rig is like a well-tuned engine: you can *feel* the rhythm of progress. Issues flow in, agents consume them, work gets completed, and the ledger drains. When the rig stalls or stutters, the gauges tell you why.

This manual explains how to monitor your rig's health using the **Beads Viewer (bv)** and command-line tools. You'll learn to interpret the key metrics that indicate rig vitality:

- **PageRank** - Task importance and unblocking priority
- **Critical Paths** - Bottlenecks preventing progress
- **Cycle Detection** - Logic loops causing infinite dependencies
- **Pulse** - The rhythm indicating whether work is flowing or stalled

**Target Audience:** Human Overseers, Mayors (AI coordinators), and system operators monitoring Gastown rigs.

---

## Part I: The Beads Viewer (bv)

### What is bv?

The **Beads Viewer** is a terminal-based UI (TUI) for visualizing and interacting with the Beads issue tracking system. It provides real-time visibility into:
- Issue status and priority
- Dependency graphs
- PageRank scores
- Critical paths
- Work distribution

### Launching bv

```bash
# From within your rig directory
cd ~/gt/myproject/crew/yourname
bv
```

**Navigation:**
- `↑/↓` or `j/k` - Navigate issues
- `Enter` - View issue details
- `Tab` - Switch between views
- `q` - Quit
- `?` - Help/keyboard shortcuts

### Primary Views

#### 1. Issue List View (Default)

Shows all issues with:
- **ID** - Issue identifier (e.g., `beads-123`)
- **Status** - `open`, `in_progress`, `blocked`, `closed`
- **Priority** - P0 (critical) to P4 (backlog)
- **PageRank** - Calculated importance (⭐⭐⭐ = high)
- **Title** - Issue description
- **Assignee** - Who's working on it
- **Blocked By** - Dependencies preventing progress

**Color Coding:**
- 🟢 Green - Ready to work (no blockers)
- 🟡 Yellow - In progress
- 🔴 Red - Blocked
- ⚫ Gray - Closed

#### 2. Dependency Graph View

Visual representation of issue dependencies:
```
beads-100 [Feature X]
  ↓ blocks
beads-101 [Tests for X]
  ↓ blocks
beads-102 [Deploy X]
```

**Indicators:**
- **Bold** - Critical path issues (highest unblocking impact)
- **Highlighted** - Currently selected issue
- **Dimmed** - Closed issues (included for context)

#### 3. PageRank View

Issues sorted by strategic importance (highest PageRank first):
```
Rank | Score | Issue       | Title                    | Blocks
-----|-------|-------------|--------------------------|-------
1    | 0.45  | beads-100   | Core Infrastructure      | 5 issues
2    | 0.32  | beads-101   | API Foundation           | 3 issues
3    | 0.12  | beads-102   | Frontend Setup           | 1 issue
```

**Interpretation:**
- **Score** - Higher = more strategic importance
- **Blocks** - How many downstream issues this unblocks

#### 4. Convoy View (if using Gastown)

Shows convoy (work unit) status:
```
Convoy: Authentication System
Status: In Progress
Issues: 7 total (2 closed, 3 in_progress, 2 blocked)
Progress: ████████░░░░░░░░░░░░ 40%
```

---

## Part II: Understanding PageRank

### What is PageRank?

PageRank is an algorithm (originally from Google Search) that calculates the relative importance of nodes in a graph. In Beads, issues are nodes and dependencies are edges.

**Key Insight:** Issues that unblock many other issues should be prioritized, even if their nominal priority (P0-P4) is lower.

### How PageRank Works

1. **Graph Construction:**
   - Each issue is a node
   - Each dependency creates a directed edge
   - `A depends on B` creates edge `A → B` (B blocks A)

2. **Iterative Calculation:**
   - Start with equal importance for all issues
   - Importance flows from dependent issues to their dependencies
   - Converge after multiple iterations

3. **Result:**
   - Issues with high PageRank are strategic bottlenecks
   - Completing them unblocks the most downstream work

### Example: Reading PageRank Scores

```bash
bd ready
# Output:
# 📋 Ready work (3 issues with no blockers):
# 1. [P2] [task] beads-100: Infrastructure setup ⭐⭐⭐
# 2. [P1] [bug] beads-101: Fix login bug ⭐⭐
# 3. [P2] [task] beads-102: Add logging ⭐
```

**Interpretation:**

| Issue | Priority | PageRank | Meaning |
|-------|----------|----------|---------|
| beads-100 | P2 | ⭐⭐⭐ | Despite medium priority, this unblocks many issues (HIGH strategic value) |
| beads-101 | P1 | ⭐⭐ | High priority but fewer downstream dependencies (MEDIUM strategic value) |
| beads-102 | P2 | ⭐ | Medium priority, doesn't block much (LOW strategic value) |

**Action:** Work on `beads-100` first, even though it's P2, because PageRank indicates it's the bottleneck.

### When to Override PageRank

PageRank is strategic but not absolute. Override when:
1. **Time-sensitive issues** - Deadline today? Do it first.
2. **External blockers** - Partner team needs quick answer? Prioritize.
3. **Incidents** - Production down? Critical bug trumps PageRank.
4. **User-facing** - Customer-visible issues may need immediate attention.

**Best Practice:** Trust PageRank for 80% of work. Override consciously for the other 20%.

---

## Part III: Identifying Critical Paths

### What is a Critical Path?

The **critical path** is the longest chain of dependencies from start to completion. Issues on the critical path determine the minimum time to complete the project.

**Example:**
```
beads-001 [2 days] → beads-002 [3 days] → beads-003 [1 day]
└─ Critical path: 6 days total

beads-004 [5 days] (parallel, not on critical path)
```

Completing `beads-001`, `beads-002`, `beads-003` is required to finish. `beads-004` can run in parallel.

### Visualizing Critical Paths in bv

In the **Dependency Graph View**, critical path issues are **bold**:

```
**beads-001** [Setup Database] ← Critical path
  ↓ blocks
**beads-002** [API Layer] ← Critical path
  ↓ blocks
**beads-003** [Deploy] ← Critical path

beads-004 [Documentation] (parallel, not critical)
```

### Finding Critical Paths via CLI

```bash
# List all dependencies
bd list --status=open

# For each issue, check what it blocks
bd show <issue-id>
# Look at "Blocks:" field

# Identify longest chain
# Issues blocking many others are likely on critical path
```

### Why Critical Paths Matter

1. **Focus Effort** - Work on critical path first
2. **Avoid Distractions** - Non-critical work can wait
3. **Parallelize** - Off-path work can run concurrently
4. **Estimate Completion** - Critical path length = minimum timeline

### Critical Path Bottlenecks

**Symptom:** One issue on critical path is blocked or taking too long.

**Impact:** Entire project delayed, even if other issues complete.

**Diagnosis:**
```bash
bd blocked
# Check if any blocked issues are on critical path

bd show <critical-issue>
# Review dependencies, comments, assignee
```

**Remediation:**
1. **Escalate** - Assign best agent or human to critical path work
2. **Decompose** - Break issue into smaller parallel tasks
3. **Unblock** - Resolve dependencies immediately
4. **Re-route** - Find alternative approach that avoids blocker

---

## Part IV: Cycle Detection

### What is a Dependency Cycle?

A **cycle** occurs when issues form a circular dependency:
```
beads-A depends on beads-B
beads-B depends on beads-C
beads-C depends on beads-A  ← Cycle!
```

**Result:** None of the issues can progress. The rig is deadlocked.

### Symptoms of Cycles

1. **Infinite Blocking** - Issues never become unblocked
2. **Zero Ready Work** - `bd ready` shows nothing available
3. **Stalled Convoy** - Convoy progress stuck at same percentage for hours
4. **Agent Confusion** - Polecats report circular requirements

### Detecting Cycles

#### Automatic Detection (bv)

The Beads Viewer automatically detects cycles and highlights them:
```
⚠️  CYCLE DETECTED ⚠️
beads-100 → beads-101 → beads-102 → beads-100
```

#### Manual Detection (CLI)

```bash
# Check for blocked issues
bd blocked

# For each blocked issue, trace dependencies
bd show beads-A
# Depends on: beads-B

bd show beads-B
# Depends on: beads-C

bd show beads-C
# Depends on: beads-A  ← Cycle found!
```

### Breaking Cycles

**Option 1: Remove Unnecessary Dependency**
```bash
# Analyze which dependency is optional
# Remove it
bd dep remove beads-C beads-A
```

**Option 2: Decompose Issues**
```bash
# Split beads-A into two parts
bd create --title="Part 1 of A (no deps)" --type=task
bd create --title="Part 2 of A (depends on C)" --type=task

bd dep add beads-A-part2 beads-C
bd dep remove beads-A beads-B  # Remove circular dep
bd dep add beads-B beads-A-part1  # Depend on part 1 only
```

**Option 3: Re-architect**
```bash
# Rethink approach to eliminate circular requirement
# Create new issue with cleaner dependencies
# Close old issues causing cycle
```

### Preventing Cycles

1. **Plan Dependencies Upfront** - Draw dependency graph before creating issues
2. **Validate Before Adding** - Check if new dependency would create cycle
3. **Limit Dependency Depth** - Avoid chains deeper than 5 levels
4. **Regular Audits** - Run `bd doctor` to check for cycles

---

## Part V: Reading the Rig Pulse

### What is the Pulse?

The **pulse** is the rhythm of work flowing through your rig. A healthy pulse indicates:
- Issues created → assigned → completed at steady rate
- Ledger (total open issues) draining over time
- Agents actively committing to hooks
- Convoys progressing toward completion

A weak or absent pulse indicates:
- Stalled work (issues in_progress but no commits)
- Growing backlog (issues created faster than closed)
- Idle agents (agents available but no work assigned)
- Blocked pipeline (high proportion of issues blocked)

### Metrics of a Healthy Pulse

#### 1. Issue Flow Rate

**Formula:**
```
Flow Rate = (Issues Closed) / (Time Period)
```

**Example:**
- 20 issues closed in 5 days = 4 issues/day flow rate

**Monitoring:**
```bash
# Check closed issues in last 7 days
bd list --status=closed | grep "Created:" | tail -20

# Or use stats
bd stats
# Look at "Closed: X" count
```

**Healthy Pulse:**
- Flow rate consistent day-to-day
- Flow rate matches or exceeds issue creation rate
- Trend: total open issues decreasing

**Weak Pulse:**
- Flow rate near zero (few issues closing)
- Issues created faster than closed (backlog growing)
- Trend: total open issues increasing

#### 2. Ledger Drain Rate

**The Ledger:** Total count of open issues (open + in_progress + blocked)

**Drain Rate:**
```
Drain Rate = Change in Ledger / Time Period
```

**Example:**
- Day 1: 50 open issues
- Day 5: 30 open issues
- Drain rate = -20 issues / 4 days = -5 issues/day (GOOD)

**Monitoring:**
```bash
bd stats
# Note "Open:" count
# Track daily

# Or automate
echo "$(date),$(bd list --status=open | wc -l)" >> ledger_history.csv
```

**Healthy Pulse:**
- Ledger draining (negative drain rate)
- Steady progress toward zero open issues

**Weak Pulse:**
- Ledger growing (positive drain rate)
- Open issues accumulating

#### 3. Agent Activity Rate

**Formula:**
```
Activity Rate = (Hook Commits) / (Active Agents * Time Period)
```

**Example:**
- 3 active agents
- 60 commits in 4 hours
- Activity rate = 60 / (3 * 4) = 5 commits/agent/hour

**Monitoring:**
```bash
# Check hook activity
gt hooks list

# For each hook, check recent commits
cd ~/gt/myproject/hooks/polecat-1
git log --oneline --since="4 hours ago" | wc -l

# Repeat for all active agents
```

**Healthy Pulse:**
- >4 commits/agent/hour (commit every 15 min)
- Consistent activity across agents
- Hook commits correlate with issue progress

**Weak Pulse:**
- <2 commits/agent/hour (agents idle or stuck)
- Some agents active, others silent (workload imbalance)
- Commits but no issue closure (busy work, not progress)

#### 4. Convoy Progress Rate

**Formula:**
```
Progress Rate = (Issues Completed) / (Total Issues in Convoy)
```

**Example:**
- Convoy: 10 issues
- 3 issues closed
- Progress: 30%
- After 2 hours: 5 issues closed (50%)
- Progress rate: 20% per 2 hours = 10%/hour

**Monitoring:**
```bash
gt convoy show <convoy-id>
# Note progress percentage

# Check again later
gt convoy show <convoy-id>
# Calculate rate of change
```

**Healthy Pulse:**
- Progress increasing steadily
- Completion estimate realistic (linear projection)
- No long periods of stagnation

**Weak Pulse:**
- Progress stuck at same percentage for >4 hours
- Completion estimate keeps slipping (non-linear)
- Multiple issues in_progress but none completing

---

## Part VI: Diagnostic Procedures

### Scenario 1: Rig Appears Stalled

**Symptoms:**
- No issues closing in 24+ hours
- Agents appear active but no commits
- Convoy progress stuck

**Diagnosis Steps:**

```bash
# Step 1: Check what's in progress
bd list --status=in_progress

# Step 2: Check blocked issues
bd blocked

# Step 3: Check agent status
gt agents

# Step 4: Check hook activity
gt hooks list
cd ~/gt/myproject/hooks/polecat-X
git log --oneline --since="24 hours ago"

# Step 5: Check for cycles
# Manually trace dependencies (see Part IV)
```

**Common Causes:**
1. **Circular Dependencies** - Cycle preventing any progress
2. **All Work Blocked** - No ready work available
3. **Agent Degradation** - Agents stuck in Ralph Wiggum state
4. **External Blocker** - Waiting on infrastructure, API keys, etc.

**Remediation:**
1. Break cycles (see Part IV)
2. Escalate blockers to Human Overseer
3. Restart degraded agents (see GUPP troubleshooting)
4. Create unblocked work to maintain momentum

---

### Scenario 2: Ledger Growing Instead of Draining

**Symptoms:**
- Total open issues increasing
- Issues created faster than closed
- Backlog accumulating

**Diagnosis Steps:**

```bash
# Step 1: Check flow rates
bd stats
# Note Open vs Closed counts

# Step 2: Check issue creation rate
bd list --status=open | grep "Created:" | tail -50
# Look for burst of new issues

# Step 3: Check completion rate
bd list --status=closed | grep "Updated:" | tail -50
# Are issues closing?

# Step 4: Check priorities
bd list --status=open
# Are high-priority issues being created but not worked?
```

**Common Causes:**
1. **Over-Planning** - Creating too many issues upfront
2. **Scope Creep** - Discovering work faster than completing it
3. **Insufficient Agent Resources** - Not enough Polecats assigned
4. **Poor Prioritization** - Working on low-value issues

**Remediation:**
1. Pause issue creation until ledger drains
2. Close stale or unnecessary issues
3. Spawn additional Polecats for high-value work
4. Focus on critical path (use PageRank)

---

### Scenario 3: Agents Active But No Progress

**Symptoms:**
- High hook commit rate
- Issues in_progress for days
- No issues closing

**Diagnosis Steps:**

```bash
# Step 1: Review hook commits
cd ~/gt/myproject/hooks/polecat-X
git log --oneline --since="4 hours ago"
git diff HEAD~5 HEAD

# Step 2: Check what changed
# Are commits meaningful progress or thrashing?

# Step 3: Review agent messages
# Check Agent Mail for signs of confusion

# Step 4: Inspect issue scope
bd show <in-progress-issue>
# Is issue too large? Ambiguous?
```

**Common Causes:**
1. **Issue Too Large** - Task should be decomposed
2. **Ambiguous Requirements** - Agent doesn't know "done"
3. **Ralph Wiggum State** - Agent confused or looping
4. **External Blocker Undetected** - Agent can't progress but hasn't escalated

**Remediation:**
1. Decompose large issues into smaller tasks
2. Clarify requirements (Human Overseer message)
3. Restart degraded agents
4. Explicitly mark blocked and escalate

---

### Scenario 4: Unbalanced Agent Load

**Symptoms:**
- Some agents very active, others idle
- Hook commits concentrated in few agents
- Some issues in_progress for days, others completing quickly

**Diagnosis Steps:**

```bash
# Step 1: Check agent distribution
gt agents
# How many agents active?

# Step 2: Check work distribution
bd list --status=in_progress
# How many issues assigned to each agent?

# Step 3: Check ready work
bd ready
# Is unassigned work available?

# Step 4: Check hook activity per agent
# Compare commit rates across agents
```

**Common Causes:**
1. **Work Not Distributed** - Mayor not slinging available work
2. **Agent Specialization** - Only certain agents qualified for work
3. **Degraded Agent** - One agent stuck, others working fine
4. **Convoy Bottleneck** - One convoy blocking others

**Remediation:**
1. Mayor: sling ready work to idle agents
2. Verify agent capabilities match work type
3. Identify and restart degraded agents
4. Parallelize convoy work where possible

---

## Part VII: Real-Time Monitoring Dashboard

### Using bv for Live Monitoring

**Recommended Layout:**

1. **Terminal 1: bv (Issue List View)**
   ```bash
   cd ~/gt/myproject/crew/yourname
   bv
   ```
   Refresh: `r` key

2. **Terminal 2: bd stats (Watch Mode)**
   ```bash
   watch -n 30 'bd stats'
   # Updates every 30 seconds
   ```

3. **Terminal 3: Hook Activity**
   ```bash
   watch -n 60 'gt hooks list'
   # Updates every 60 seconds
   ```

4. **Terminal 4: Mayor Session**
   ```bash
   gt mayor attach
   # Interactive control
   ```

### Gastown Web Dashboard

If you have the dashboard installed:

```bash
gt dashboard --port 8080
open http://localhost:8080
```

**Features:**
- Real-time agent status
- Convoy progress charts
- Hook state visualization
- Critical path highlighting
- PageRank distribution graphs

---

## Part VIII: Health Check Checklist

Run this checklist daily or when rig feels "off":

```bash
# 1. Overall Health
☐ bd stats
  - Ledger draining? (Open issues decreasing)
  - Reasonable blocked ratio? (<20% blocked)

# 2. Work Availability
☐ bd ready
  - Is ready work available?
  - Are Polecats idle when work exists?

# 3. Blocked Work
☐ bd blocked
  - Any issues blocked >24 hours?
  - Are blockers being resolved?

# 4. In-Progress Work
☐ bd list --status=in_progress
  - Any issues in_progress >48 hours?
  - Are agents making commits?

# 5. Agent Activity
☐ gt agents
  - Are active agents correlated with in_progress issues?
  - Any agents idle when work available?

# 6. Hook Health
☐ gt hooks list
  - Recent commits for active agents?
  - Any stale hooks needing cleanup?

# 7. Convoy Progress
☐ gt convoy list
  - Are convoys progressing?
  - Any stalled convoys?

# 8. System Diagnostics
☐ bd doctor
  - Any errors or warnings?
☐ gt doctor
  - Any configuration issues?

# 9. Critical Path
☐ Review dependency graph in bv
  - Is critical path work prioritized?
  - Any bottlenecks forming?

# 10. Cycle Detection
☐ Check for circular dependencies
  - Run bv and look for cycle warnings
  - Manually verify if suspected
```

**Scoring:**
- 10/10 checks pass: Healthy rig ✅
- 7-9 checks pass: Minor issues, monitor closely ⚠️
- <7 checks pass: Degraded state, intervention needed 🚨

---

## Part IX: Key Performance Indicators (KPIs)

### Tracking Over Time

Create a monitoring log:

```bash
# Daily tracking script
#!/bin/bash
DATE=$(date +%Y-%m-%d)
OPEN=$(bd list --status=open | wc -l)
IN_PROGRESS=$(bd list --status=in_progress | wc -l)
BLOCKED=$(bd blocked | wc -l)
CLOSED_TOTAL=$(bd list --status=closed | wc -l)

echo "$DATE,$OPEN,$IN_PROGRESS,$BLOCKED,$CLOSED_TOTAL" >> ~/gt/myproject/metrics.csv
```

### Baseline Metrics (Establish for Each Rig)

| Metric | Healthy Range | Warning Threshold | Critical Threshold |
|--------|---------------|-------------------|-------------------|
| Ledger Drain Rate | -3 to -10 issues/day | -1 to 0 issues/day | >0 issues/day (growing) |
| Agent Activity | 4-8 commits/agent/hour | 2-4 commits/agent/hour | <2 commits/agent/hour |
| Blocked Ratio | <10% | 10-20% | >20% |
| Avg Issue Age (open) | <7 days | 7-14 days | >14 days |
| Convoy Progress | >10% per day | 5-10% per day | <5% per day |

### Alerting Rules

**Set up alerts when:**
1. Ledger growing for >3 consecutive days
2. No issues closed in 24 hours
3. Blocked ratio >20%
4. Agent silent (no commits) for >2 hours
5. Convoy progress stalled for >4 hours
6. Cycle detected

---

## Part X: Advanced Techniques

### PageRank Tuning

Adjust PageRank algorithm parameters (advanced):

```bash
# Default PageRank settings in .beads/config.json
{
  "pagerank": {
    "damping_factor": 0.85,
    "iterations": 20,
    "convergence_threshold": 0.0001
  }
}
```

**Damping Factor:**
- Higher (0.9) = More emphasis on dependencies
- Lower (0.7) = More emphasis on nominal priority

**Iterations:**
- More iterations = More accurate but slower calculation

### Custom Health Metrics

Create project-specific metrics:

```bash
# Example: Test coverage correlation
echo "$(date),$(bd list --status=open | wc -l),$(pytest --cov --cov-report=term | grep TOTAL | awk '{print $4}')" >> health_metrics.csv

# Track: As ledger drains, does test coverage increase?
```

### Predictive Monitoring

Use historical data to predict completion:

```python
import pandas as pd
import numpy as np

# Load metrics
df = pd.read_csv('metrics.csv', names=['date', 'open', 'in_progress', 'blocked', 'closed'])

# Calculate drain rate
df['drain_rate'] = df['open'].diff()

# Predict days to zero open issues
current_open = df['open'].iloc[-1]
avg_drain_rate = df['drain_rate'].tail(7).mean()

if avg_drain_rate < 0:
    days_to_complete = current_open / abs(avg_drain_rate)
    print(f"Estimated completion: {days_to_complete:.1f} days")
else:
    print("Warning: Ledger growing, not draining")
```

---

## Appendix A: Quick Reference Commands

### Essential Monitoring Commands

```bash
# Overall health
bd stats

# Available work
bd ready

# Blocked issues
bd blocked

# In-progress work
bd list --status=in_progress

# Agent status
gt agents

# Hook activity
gt hooks list

# Convoy progress
gt convoy list
gt convoy show <convoy-id>

# Diagnostics
bd doctor
gt doctor

# Visual monitoring
bv
```

### Watching Commands (Auto-Refresh)

```bash
# Stats refresh every 30s
watch -n 30 'bd stats'

# Ready work refresh every 60s
watch -n 60 'bd ready'

# Agent status refresh every 30s
watch -n 30 'gt agents'
```

---

## Appendix B: Interpreting bv Output

### Issue List Colors

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | Open, no blockers | Ready to work |
| 🟡 Yellow | In progress | Agent working |
| 🔴 Red | Blocked | Has open dependencies |
| ⚫ Gray | Closed | Completed |

### PageRank Stars

| Stars | Score Range | Priority |
|-------|-------------|----------|
| ⭐⭐⭐ | >0.30 | Critical - unblocks many |
| ⭐⭐ | 0.15-0.30 | High - significant impact |
| ⭐ | <0.15 | Normal - limited impact |

---

## Appendix C: Troubleshooting Table

| Symptom | Likely Cause | Check | Fix |
|---------|--------------|-------|-----|
| Zero ready work | All issues blocked or in-progress | `bd ready` | Add new issues or resolve blockers |
| Growing ledger | Creating issues faster than closing | `bd stats` (track daily) | Pause creation, focus on completion |
| Stalled convoy | Blocker on critical path | `gt convoy show <id>` | Escalate or decompose blocker |
| Agent idle | No work assigned | `gt agents` + `bd ready` | Mayor: sling work to agent |
| Agent active, no progress | Ralph Wiggum state | Check hook commits | Restart agent with clear instructions |
| High blocked ratio | Poor dependency planning | `bd blocked` | Review and break cycles |
| Cycle detected | Circular dependencies | `bv` (look for warnings) | Remove or decompose dependencies |
| No commits | Agent stuck or waiting | `gt hooks list` | Escalate or check for external blocker |

---

## Conclusion

Monitoring a Gastown rig is about reading the pulse: **Is work flowing, or is it stalled?**

The gauges (PageRank, critical paths, ledger drain rate) tell you what's happening. The dials (bv, bd stats, gt agents) give you real-time visibility. Together, they enable you to operate the rig at peak efficiency.

**Key Takeaways:**
1. **PageRank surfaces bottlenecks** - Trust it for strategic priority
2. **Critical paths determine timeline** - Focus effort there
3. **Cycles deadlock the rig** - Detect and break them immediately
4. **Pulse indicates health** - Steady drain rate = healthy rig
5. **Intervene when stalled** - Don't wait for rig to self-correct

**Next Steps:**
- Set up daily health check routine
- Establish baseline metrics for your rig type
- Create alerting for critical thresholds
- Use bv for real-time monitoring during active development

---

**Document Status:** Living document, version 1.0
**Maintained by:** entropy-wiki project
**Last Updated:** 2026-01-08

*"Monitor the pulse. Keep the rig propelled."*
