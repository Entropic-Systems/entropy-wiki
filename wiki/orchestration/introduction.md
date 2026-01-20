# What is Orchestration?

Let's start from zero. If you're reading this, you might be new to AI agents and wondering what all this "orchestration" stuff is about.

## What is an AI Agent?

An AI agent is software that:
1. **Receives a goal** - "Fix the login bug"
2. **Takes actions** - Reads code, runs tests, writes fixes
3. **Loops until done** - Keeps trying until the goal is achieved

Think of it like an autonomous worker. You give it a task, and it figures out how to complete it.

## Why Orchestration?

One agent is powerful. Multiple agents working together? That's where magic happens.

**Orchestration** is coordinating multiple AI agents to complete complex tasks. It's the difference between:

- **Single agent**: "Fix this bug" (one task, one agent)
- **Orchestration**: "Build this feature" (research → plan → implement → test → review)

## Real-World Analogy

Imagine a construction project:

| Role | AI Equivalent |
|------|---------------|
| Architect | Planning agent (designs approach) |
| Builder | Implementation agent (writes code) |
| Inspector | Testing agent (validates quality) |
| Foreman | Orchestrator (coordinates everyone) |

No single person builds a house. No single agent builds complex software.

## Core Concepts

### 1. Task Distribution
Breaking big tasks into smaller ones that agents can handle:

```
"Build authentication system"
    ├── Research auth patterns
    ├── Design API schema
    ├── Implement backend
    ├── Write frontend
    └── Add tests
```

### 2. Agent Coordination
Deciding which agent does what, and when:

- **Sequential**: Agent A finishes → Agent B starts
- **Parallel**: Agents A and B work simultaneously
- **Hierarchical**: Supervisor agent delegates to workers

### 3. Memory & State
Agents need to remember:
- What's been done
- What's in progress
- What's blocked
- What's next

This is where tools like **Beads** come in.

### 4. Handoffs
When one agent finishes, how does the next one pick up?

Good handoffs include:
- What was completed
- What's remaining
- Key decisions made
- Context needed

## Why This Matters

Without orchestration, you're manually coordinating AI agents. That's like being the foreman on a job site, but also doing paperwork, making calls, and checking schedules.

With orchestration, you:
1. Define the goal
2. Let the system coordinate agents
3. Review the results

You become a **Droid overlord** - commanding AI armies instead of doing the work yourself.

## Where to Go Next

- **[Frameworks](./frameworks)** - Learn about Gastown and other orchestration systems
- **[Memory](./memory)** - Understand how Beads tracks work across sessions
- **[Patterns](./patterns)** - Master the Ralph Loop for autonomous execution
