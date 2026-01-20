---
title: Orchestration
description: Multi-agent coordination patterns and autonomous execution loops
---

# Orchestration

Orchestration is the art of coordinating AI agents to complete complex tasks autonomously. This is where you go from using AI to commanding AI.

## What You'll Learn

- **What is Orchestration?** - The fundamentals of multi-agent coordination
- **Frameworks** - Production-grade orchestration systems (Gastown, Flywheel)
- **Memory** - Persistent context across sessions (Beads)
- **Patterns** - Workflow patterns like Ralph loops

## Sections

### [Introduction](./introduction)
Start here if you're new to orchestration. Learn what AI agents are, why coordination matters, and the key concepts.

### [Frameworks](./frameworks)
Multi-agent orchestration frameworks for scaling AI work:
- **Gastown** - Industrial-strength multi-agent coordination
- **Flywheel** - (Coming soon)

### [Memory](./memory)
Persistence and context recovery across sessions:
- **Beads** - Issue tracking with dependencies and memory

### [Patterns](./patterns)
Workflow patterns for autonomous execution:
- **Ralph Loop** - Iterative loops until task complete

## Key Concepts

### Stop Hook Architecture
Intercepts exit attempts to force verification before loop termination, enabling autonomous iteration without human intervention.

### Circuit Breaker Pattern
Monitors failure indicators (no progress, repeated errors, declining output) and opens automatically to prevent runaway execution.

### 80/20 Rule
Optimal configuration for autonomous tasks: spend 80% of time on the primary task, 20% on testing and verification.

## Multi-Agent Workflows

- [Claude Code Multi-Agent Workflow](./claude-code-multi-agent-workflow) - Coordination patterns for parallel agent execution
