# Ralph Wiggum Plugin Summary

## Overview
The Ralph Wiggum plugin implements an iterative AI development loop technique in Claude Code. Named after the persistent Simpsons character, it enables autonomous, self-referential improvement cycles where Claude refines its work iteratively until completion.

## Core Architecture: Stop Hook

**Key Mechanism**: A **Stop Hook** (`hooks/stop-hook.sh`) intercepts Claude's exit attempts and creates a self-referential feedback loop:

```bash
# You run ONCE:
/ralph-loop "Your task description" --completion-promise "DONE"

# Then Claude Code automatically:
# 1. Works on the task
# 2. Tries to exit
# 3. Stop hook blocks exit
# 4. Stop hook feeds the SAME prompt back
# 5. Repeat until completion
```

**Why it works**: The prompt never changes, but previous work persists in files. Each iteration, Claude sees modified files and git history, enabling autonomous self-improvement by reading its own past work.

## Plugin Configuration

**Directory Structure**:
- `.claude-plugin/` - Plugin metadata
- `commands/` - Command implementations
- `hooks/` - Stop hook logic
- `scripts/` - Supporting utilities

**Commands**:

### `/ralph-loop`
```bash
/ralph-loop "<prompt>" --max-iterations <n> --completion-promise "<text>"
```

**Options**:
- `--max-iterations <n>` - Stop after N iterations (default: unlimited)
- `--completion-promise <text>` - Phrase that signals completion (exact string matching)

### `/cancel-ralph`
```bash
/cancel-ralph
```
Cancels the active loop immediately.

## Verification & Forced Iteration

**Self-Correction Built-in**:
- Claude reads test failures, lint errors, and file states
- Automatically fixes bugs without re-prompting
- Uses "deterministically bad" failures as data for improvement

**Safety Mechanisms**:
```bash
# Always set iteration limits:
/ralph-loop "Task" --max-iterations 20

# Include fallback instructions in prompt:
# "After 15 iterations, if not complete:
#  - Document blocking issues
#  - List attempts made
#  - Suggest alternatives"
```

**Critical**: The `--completion-promise` uses exact string matching only. Rely on `--max-iterations` as your primary safety mechanism.

## Best Practices

### Prompt Structure

**❌ Bad**: "Build a todo API and make it good."

**✅ Good**:
```
Build a REST API for todos.

When complete:
- All CRUD endpoints working
- Input validation in place
- Tests passing (coverage > 80%)
- README with API docs
- Output: <promise>COMPLETE</promise>
```

### Incremental Goals
```
Phase 1: User authentication (JWT, tests)
Phase 2: Product catalog (list/search, tests)
Phase 3: Shopping cart (add/remove, tests)

Output <promise>COMPLETE</promise> when all phases done.
```

### TDD Workflow
```
1. Write failing tests
2. Implement feature
3. Run tests
4. If any fail, debug and fix
5. Refactor if needed
6. Repeat until all green
7. Output: <promise>COMPLETE</promise>
```

## When to Use Ralph

**Good for**:
- Well-defined tasks with clear success criteria
- Tasks requiring iteration (getting tests to pass)
- Greenfield projects where you can walk away
- Tasks with automatic verification (tests, linters)

**Not for**:
- Tasks requiring human judgment or design decisions
- One-shot operations
- Tasks with unclear success criteria
- Production debugging

## Philosophy

1. **Iteration > Perfection** - Let the loop refine work
2. **Failures Are Data** - Use predictable failures to tune prompts
3. **Operator Skill Matters** - Success depends on writing good prompts
4. **Persistence Wins** - Retry logic happens automatically

## Real-World Results

- 6 repositories generated overnight in Y Combinator hackathon
- $50k contract completed for $297 in API costs
- Entire programming language created over 3 months using this approach

**Technical Value for Agents:** Stop Hook architecture intercepts exit code to force verification steps before loop termination. Enables autonomous iteration without mid-loop human intervention.

**URL:** https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md
