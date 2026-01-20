# Patterns

Workflow patterns for autonomous AI execution. These are the building blocks you combine to create powerful orchestration.

## Core Patterns

### [Ralph Loop](./ralph-loop)
The iterative loop pattern where an agent works → validates → repeats until task complete.

```
while (not done):
    attempt solution
    validate results
    see failures in next iteration
    adjust approach
```

## Pattern Categories

### Execution Patterns
How agents complete individual tasks:
- **Ralph Loop** - Iterative refinement until success
- **TDD Loop** - Write test → implement → pass
- **Validation Loop** - Implement → validate → fix

### Coordination Patterns
How multiple agents work together:
- **Sequential** - Agent A → Agent B → Agent C
- **Parallel** - Agents A, B, C work simultaneously
- **Supervisor** - One agent delegates to workers

### Recovery Patterns
How agents handle failures:
- **Retry** - Try again with same approach
- **Escalate** - Ask for human help
- **Pivot** - Try different approach

## When to Use Which

| Situation | Pattern |
|-----------|---------|
| Self-correcting work | Ralph Loop |
| Test-driven development | TDD Loop |
| Complex multi-step task | Sequential |
| Independent subtasks | Parallel |
| Uncertain requirements | Supervisor |

## Building Your Own Patterns

Patterns combine three elements:

1. **Trigger** - What starts the pattern
2. **Loop** - What repeats
3. **Exit condition** - What ends the pattern

Example structure:
```
TRIGGER: User requests feature
LOOP:
  - Attempt implementation
  - Run validation
  - If pass: EXIT
  - If fail: Read failures, adjust, continue
EXIT: Validation passes
```
