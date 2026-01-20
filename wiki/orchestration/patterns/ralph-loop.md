# Ralph Loop Plugin

Iterative development methodology based on continuous AI loops for self-correcting, autonomous task completion.

## Overview

Ralph Loop implements the "Ralph Wiggum" technique - a development pattern where Claude repeatedly receives the same prompt while seeing its own previous work, enabling iterative refinement until task completion.

**Core principle**: The AI doesn't need its output fed back as input. It sees its own work in the files and git history, creating a self-referential improvement loop.

## The Ralph Wiggum Technique

Named after the Simpsons character, this technique embraces being "deterministically bad in an undeterministic world" - failures are predictable and can be systematically improved through prompt tuning.

### Basic Loop Structure

```bash
while :; do
  cat PROMPT.md | claude-code --continue
done
```

### How It Works

1. **Same prompt, every iteration**
   - Claude receives identical instructions each time
   - No modification between loops

2. **Self-referential context**
   - Claude sees its previous work in files
   - Reviews git history from past iterations
   - Identifies what succeeded and what failed

3. **Continuous refinement**
   - Attempts solution
   - Validates results
   - Sees failures in next iteration
   - Adjusts approach
   - Repeats until success

4. **Completion detection**
   - Outputs `<promise>TASK COMPLETE</promise>` when done
   - Or reaches max iteration limit
   - Stop hook intercepts and continues or exits

## Available Commands

### /ralph-loop

Start a Ralph Loop in the current session.

**Usage**:
```bash
/ralph-loop "Refactor the cache layer to use Redis"

/ralph-loop "Add comprehensive tests" --max-iterations 20

/ralph-loop "Fix authentication bug" --completion-promise "TESTS PASS"
```

**Options**:
- `--max-iterations <n>` - Maximum iterations before auto-stop
- `--completion-promise <text>` - Promise phrase that signals completion

**What happens**:
1. Creates `.claude/.ralph-loop.local.md` state file
2. You work on the task normally
3. When you try to exit/complete, stop hook intercepts
4. Same prompt fed back to you
5. You see your previous work and continue
6. Loop continues until promise detected or max iterations

### /cancel-ralph

Cancel an active Ralph Loop.

**Usage**:
```bash
/cancel-ralph
```

Removes the loop state file and stops the iteration cycle.

## Completion Promises

To signal task completion, output a promise tag:

```markdown
<promise>TASK COMPLETE</promise>
```

The stop hook looks for this specific XML-style tag. Without it (or `--max-iterations`), Ralph runs indefinitely.

### Promise Examples

```markdown
<!-- After all tests pass -->
<promise>ALL TESTS PASSING</promise>

<!-- After refactoring complete -->
<promise>REFACTOR COMPLETE</promise>

<!-- After bug fixed -->
<promise>BUG FIXED AND VALIDATED</promise>

<!-- Custom promise matching --completion-promise flag -->
<promise>REDIS MIGRATION COMPLETE</promise>
```

## When to Use Ralph Loop

### Good Use Cases

✅ **Well-defined tasks with clear success criteria**
- "Implement feature X with passing tests"
- "Refactor module Y to use pattern Z"
- "Fix bug that causes error E"

✅ **Iterative refinement tasks**
- Performance optimization (measure, improve, repeat)
- Test coverage expansion (add tests until 100%)
- Code quality improvements (fix linting errors)

✅ **Self-validating work**
- Tasks with automated tests
- Code with clear output/behavior
- Work with measurable success criteria

✅ **Greenfield development**
- Building new features from scratch
- Implementing well-specified requirements
- Creating new modules/components

### Poor Use Cases

❌ **Tasks requiring human judgment**
- Design decisions without clear requirements
- UX choices affecting user experience
- Architectural decisions with tradeoffs

❌ **One-shot operations**
- Database migrations (can't undo easily)
- Production deployments
- Destructive operations

❌ **Ambiguous requirements**
- "Make it better" (better how?)
- "Improve performance" (which metric?)
- "Fix the UI" (what's broken?)

❌ **Debugging production issues**
- Better to use targeted debugging
- Risk of iterative damage
- Requires careful analysis, not iteration

## Usage Patterns

### Pattern 1: Test-Driven Development

Use Ralph Loop to iteratively implement features with full test coverage:

```bash
/ralph-loop "Implement UserAuth class with JWT support.
Add comprehensive unit tests.
Output <promise>ALL TESTS PASSING</promise> when complete." \
--max-iterations 15 \
--completion-promise "ALL TESTS PASSING"
```

**Loop iterations**:
1. Create UserAuth class stub
2. Write initial tests → tests fail
3. Implement JWT generation → some tests pass
4. Fix validation logic → more tests pass
5. Add edge case handling → all tests pass
6. Output `<promise>ALL TESTS PASSING</promise>`
7. Loop exits

### Pattern 2: Incremental Refactoring

Refactor code while maintaining passing tests:

```bash
/ralph-loop "Refactor cache layer to use Redis instead of in-memory cache.
All existing tests must continue passing.
Output <promise>REFACTOR COMPLETE</promise> when done." \
--max-iterations 20 \
--completion-promise "REFACTOR COMPLETE"
```

**Loop iterations**:
1. Install Redis dependencies
2. Create Redis client wrapper
3. Replace first cache call → tests fail
4. Fix implementation → tests pass
5. Replace more cache calls → tests fail
6. Fix implementations → tests pass
7. Replace all calls → all tests pass
8. Output `<promise>REFACTOR COMPLETE</promise>`

### Pattern 3: Bug Fix with Validation

Fix bugs with automated validation:

```bash
/ralph-loop "Fix the token refresh race condition in auth.ts.
Add regression test.
Output <promise>BUG FIXED</promise> when test passes." \
--max-iterations 10 \
--completion-promise "BUG FIXED"
```

**Loop iterations**:
1. Reproduce bug, write failing test
2. Attempt fix #1 → test still fails
3. Attempt fix #2 → test still fails
4. Identify root cause (missing lock)
5. Implement proper locking → test passes
6. Output `<promise>BUG FIXED</promise>`

### Pattern 4: Performance Optimization

Iteratively improve performance metrics:

```bash
/ralph-loop "Optimize API response time to under 100ms.
Run benchmark on each iteration.
Output <promise>OPTIMIZATION COMPLETE</promise> when target met." \
--max-iterations 25 \
--completion-promise "OPTIMIZATION COMPLETE"
```

**Loop iterations**:
1. Baseline: 450ms
2. Add database indexing: 320ms
3. Implement query caching: 180ms
4. Optimize N+1 queries: 95ms
5. Output `<promise>OPTIMIZATION COMPLETE</promise>`

## Integration with Development Skills

### With validation-before-close

Ralph Loop is the execution engine for validation loops:

```markdown
validation-before-close:
  ↓
Runs build/tests
  ↓
Failures detected
  ↓
Enters Ralph Loop:
  - Fix issues
  - Re-run validation
  - See new failures
  - Fix those too
  - Repeat until passing
  ↓
All validation passes
  ↓
Close bead
```

### With task-intake

Front-load decisions so Ralph can run autonomously:

```markdown
task-intake Phase 1:
  - Ask ALL clarifying questions
  - Get design decisions upfront
  - Define clear completion criteria
  ↓
task-intake Phase 3 (Ralph Loop):
  - Execute with full context
  - No mid-loop questions
  - Self-correct based on validation
  - Complete autonomously
```

### With auto-bug-tracking

Create beads for issues discovered during loops:

```markdown
Ralph Loop iteration:
  ↓
Discovers new bug during work
  ↓
auto-bug-tracking skill:
  - Creates bead for bug
  - Adds dependency to current work
  ↓
Continue Ralph Loop on main task
  ↓
Handle bug bead later
```

## Best Practices

### Do

✅ **Define clear completion criteria**
- Use measurable success metrics
- Specify exact promise phrase
- Include validation in prompt

✅ **Set reasonable max iterations**
- 10-20 for most tasks
- 25-30 for complex work
- Prevents infinite loops

✅ **Make success programmatically verifiable**
- "All tests pass" (can check with test runner)
- "Build succeeds" (can check with build command)
- "Performance under X" (can measure)

✅ **Use Ralph for well-scoped tasks**
- One feature at a time
- Clear inputs and outputs
- Defined success criteria

### Don't

❌ **Don't use vague completion criteria**
- Bad: "Make it good"
- Good: "All tests pass and coverage >80%"

❌ **Don't mix multiple unrelated tasks**
- Bad: "Fix auth AND add dashboard AND optimize DB"
- Good: "Fix auth token refresh race condition"

❌ **Don't skip max-iterations limit**
- Always set a safety limit
- Prevents runaway loops
- 15-20 is usually sufficient

❌ **Don't use for destructive operations**
- Database migrations
- Production deployments
- Irreversible changes

## Ralph Loop State Management

### State File

Ralph Loop creates `.claude/.ralph-loop.local.md` to track state:

```markdown
---
prompt: "Original task prompt"
maxIterations: 20
completionPromise: "TASK COMPLETE"
currentIteration: 7
startedAt: "2024-01-09T10:30:00Z"
---

# Ralph Loop Active

Working on: [task description]
```

### Checking Loop Status

```bash
# Check if loop is active
cat .claude/.ralph-loop.local.md

# View iteration count
grep currentIteration .claude/.ralph-loop.local.md
```

### Manual Cancellation

```bash
# Cancel via command
/cancel-ralph

# Or manually remove state file
rm .claude/.ralph-loop.local.md
```

## Troubleshooting

### Loop Doesn't Exit
**Symptom**: Ralph continues iterating past completion

**Solution**:
1. Ensure you output exact promise tag: `<promise>TEXT</promise>`
2. Verify promise text matches `--completion-promise` flag
3. Check max-iterations isn't too high
4. Use `/cancel-ralph` if stuck

### Loop Exits Too Early
**Symptom**: Ralph stops before task complete

**Solution**:
1. Increase `--max-iterations` limit
2. Check if promise tag was accidentally output
3. Review stop hook configuration
4. Ensure task is achievable in scope

### Iterations Not Self-Correcting
**Symptom**: Same errors every iteration

**Solution**:
1. Make failures visible in files (write test output)
2. Include validation in each iteration
3. Ensure error messages are clear
4. Check if task is too ambiguous

## Advanced Usage

### Nested Validation Loops

```bash
/ralph-loop "Implement feature with multi-stage validation:
1. Code compiles
2. Unit tests pass
3. Integration tests pass
4. E2E tests pass
Output <promise>ALL VALIDATION PASSED</promise>" \
--max-iterations 30 \
--completion-promise "ALL VALIDATION PASSED"
```

### Chained Ralph Loops

Complete multiple tasks sequentially:

```bash
# Task 1
/ralph-loop "Implement API endpoints" --completion-promise "API DONE"

# After API done, Task 2
/ralph-loop "Add frontend integration" --completion-promise "FRONTEND DONE"

# After frontend done, Task 3
/ralph-loop "Write E2E tests" --completion-promise "TESTS DONE"
```

### Ralph with Context Management

Use context-management skill to keep loops efficient:

```markdown
Long Ralph Loop (15+ iterations):
  ↓
context-management skill monitors:
  - Token usage increasing
  - Context getting full
  ↓
Suggests compaction:
  - Summarize resolved issues
  - Keep current work focus
  - Prune old iteration details
  ↓
Continue Ralph with clean context
```

## Learning More

- **Original technique**: [Ralph Wiggum by Geoffrey Huntley](https://ghuntley.com/ralph/)
- **Ralph Orchestrator**: [github.com/mikeyobrien/ralph-orchestrator](https://github.com/mikeyobrien/ralph-orchestrator)
- **validation-before-close skill**: Uses Ralph Loop for validation iterations

## Quick Reference

```markdown
Start Ralph Loop:
  /ralph-loop "task description" --max-iterations 20 --completion-promise "DONE"

Signal completion:
  <promise>DONE</promise>

Cancel loop:
  /cancel-ralph

Check status:
  cat .claude/.ralph-loop.local.md

Best practices:
  - Clear completion criteria
  - Reasonable max iterations (10-25)
  - Programmatically verifiable success
  - Well-scoped single task
```
