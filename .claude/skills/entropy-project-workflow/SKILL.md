---
name: entropy-project-workflow
description: MANDATORY workflow for ALL non-trivial work in entropy-wiki. Phase 1 - Question loop until satisfied. Phase 2 - Create all beads. Phase 3 - Ralph loop with validation-before-close for each bead.
---

# Entropy Project Workflow

**CRITICAL**: This skill MUST be used for ANY non-trivial natural language instruction in entropy-wiki.

## Trigger

Use this skill when:
- User provides a natural language task/feature request
- Work is non-trivial (not a typo fix or single-line change)
- ANY ambiguity exists in requirements

## Three-Phase Workflow

### Phase 1: Clarification Loop (BLOCKING)

**Objective**: Achieve 100% clarity before writing ANY code.

```markdown
1. Invoke ask-questions-if-underspecified skill
2. Ask 1-5 critical questions
3. Get user answers
4. Ask yourself: "Do I have 100% clarity on every decision?"
   - If NO → REPEAT from step 1
   - If MAYBE → REPEAT from step 1
   - If YES → Proceed to Phase 2

Exit Criteria:
✓ All design decisions settled
✓ Scope clearly defined
✓ Acceptance criteria known
✓ No remaining ambiguities
```

**Anti-Pattern**:
- ❌ Moving forward with "probably" or "I think they mean..."
- ❌ Asking only 1 round of questions when more clarity needed
- ❌ Making assumptions about user intent

### Phase 2: Work Breakdown (COMPLETE UPFRONT)

**Objective**: Create ALL beads and dependencies before implementation.

```markdown
1. Determine if epic needed (multi-task work? → YES)

2. Create epic (if needed):
   bd create "Epic: <description>" --type=epic --priority=<0-4>

3. Create ALL child tasks/beads:
   bd create "Task: <specific work>" \
     --type=task \
     --priority=<0-4> \
     --parent=<epic-id> \
     --description="..." \
     --acceptance="<criteria from Phase 1>"

4. Link ALL dependencies:
   bd dep add <task-b> <task-a>  # B depends on A

5. Verify work breakdown:
   bd ready  # Should show first unblocked task
   bd show <epic-id>  # Review full structure

6. Show user the work breakdown
   - Present epic + all tasks
   - Show dependency graph
   - Confirm before proceeding

Exit Criteria:
✓ All tasks created as beads
✓ Dependencies linked
✓ User approved work breakdown
✓ bd ready shows correct first task
```

**Anti-Pattern**:
- ❌ Creating beads "as you go" during implementation
- ❌ Not linking dependencies
- ❌ Starting work without user seeing full breakdown

### Phase 3: Ralph Wiggum Loop (PER BEAD)

**Objective**: Implement with continuous validation until DoD met.

```markdown
Loop until bd ready shows no tasks:

  1. Get next task:
     bd ready

  2. Mark in progress:
     bd update <bead-id> --status=in_progress

  3. Implement changes:
     - Write code
     - Make edits
     - Add files

  4. VALIDATE (use validation-before-close skill):
     - Invoke validation-before-close skill for this bead
     - Skill determines appropriate validation type:
       * Build validation (npm run build)
       * Test validation (npm test)
       * Smoke testing (manual checks)
       * Full validation (all of above)
     - Skill runs validation commands
     - Skill reports: PASS or FAIL

  5. Validation result?

     PASS → Go to step 6

     FAIL → Ralph loop:
       a. Create bug bead if significant issue:
          bd create "Bug: <issue>" --type=bug --deps="discovered-from:<current-bead>"
       b. Fix the issue
       c. Re-validate (go back to step 4)
       d. LOOP until validation passes

  6. Close bead:
     bd close <bead-id>

  7. Repeat from step 1 (next task from bd ready)

Exit Criteria:
✓ bd ready shows "No open issues"
✓ All beads validated and closed
✓ No failing builds or tests
```

**Anti-Pattern**:
- ❌ Implementing multiple beads before validating
- ❌ Closing beads without running validation-before-close
- ❌ Batching closes without per-bead validation
- ❌ Skipping validation "because it probably works"

## Integration with Existing Skills

This skill **orchestrates** existing skills:

| Phase | Uses Skill | For What |
|-------|-----------|----------|
| Phase 1 | ask-questions-if-underspecified | Question loop |
| Phase 2 | bead-workflow | Creating and managing beads |
| Phase 2 | dod-criteria | Defining acceptance criteria |
| Phase 3 | validation-before-close | **All validation logic** |
| Phase 3 | auto-bug-tracking | Creating bug beads when issues found |
| Phase 3 | context-management | Keeping loops efficient |

**Key Point**: This skill does NOT define WHAT to validate or HOW. That's in `validation-before-close`. This skill defines WHEN to validate (continuously in loops).

## Entropy-Wiki Specific Commands

For this repo, validation typically includes:

```bash
# Build validation (always)
npm run build

# Meta generation (if docs changed)
npm run gen-meta

# Search index (if docs changed)
npm run gen-search

# Bundle analysis (if dependencies changed)
npm run analyze

# Manual checks
# - Visit localhost:3000
# - Test navigation
# - Test search
# - Test theme toggle
```

But defer to `validation-before-close` for determining which commands to run based on work type.

## Example: Full Workflow

**User says**: "Add a new feature to export documentation to PDF"

### Phase 1: Questions
```
Q1: Export scope?
   a) Current page only (Recommended)
   b) Entire section
   c) Full wiki

Q2: PDF styling?
   a) Match current theme
   b) Print-optimized stylesheet
   c) Both (theme toggle in PDF)

Q3: Implementation approach?
   a) Browser print API
   b) Server-side PDF generation (puppeteer)
   c) Third-party service

Reply: 1a 2b 3a
```

User answers → 100% clarity achieved → Proceed to Phase 2

### Phase 2: Work Breakdown
```bash
bd create "Epic: PDF Export Feature" --type=epic --priority=2

bd create "Task: Add print stylesheet" \
  --type=task --parent=<epic> --priority=2

bd create "Task: Create export button component" \
  --type=task --parent=<epic> --priority=2

bd create "Task: Implement browser print API" \
  --type=task --parent=<epic> --priority=2

bd create "Task: Test PDF generation" \
  --type=task --parent=<epic> --priority=2

bd dep add <task2> <task1>  # Button depends on stylesheet
bd dep add <task3> <task2>  # API depends on button
bd dep add <task4> <task3>  # Tests depend on API

bd ready  # Shows: Task 1 (stylesheet)
```

Show user → Get approval → Proceed to Phase 3

### Phase 3: Ralph Loops

**Bead 1: Print stylesheet**
```
bd update <id> --status=in_progress
→ Create print.css
→ validation-before-close: npm run build ✅
→ validation-before-close: Manual check (print preview) ✅
bd close <id>
```

**Bead 2: Export button**
```
bd update <id> --status=in_progress
→ Create ExportButton.tsx
→ validation-before-close: npm run build ❌ (import error)
→ Fix import
→ validation-before-close: npm run build ✅
→ validation-before-close: Manual check (button appears) ✅
bd close <id>
```

**Bead 3: Browser print API**
```
bd update <id> --status=in_progress
→ Implement print functionality
→ validation-before-close: npm run build ✅
→ validation-before-close: Manual test (click button) ❌ (blank PDF)
→ Create bug bead
→ Fix CSS media query
→ validation-before-close: Manual test ✅
→ Close bug bead
bd close <id>
```

**Bead 4: Tests**
```
bd update <id> --status=in_progress
→ Write tests
→ validation-before-close: npm run build ✅
→ validation-before-close: npm test ✅
bd close <id>
```

**Result**: Feature complete, all validated, epic closes automatically.

## Benefits

1. **No wasted work**: Questions answered upfront
2. **Clear progress**: All beads visible from start
3. **Quality**: Continuous validation catches issues immediately
4. **Persistent**: Beads survive context compaction
5. **Efficient**: PageRank + dependencies = automatic task ordering

## Quick Reference

```markdown
Receive task
  ↓
Phase 1: Question loop (ask-questions-if-underspecified)
  ↓ (100% clarity)
Phase 2: Create all beads (bead-workflow + dod-criteria)
  ↓ (user approval)
Phase 3: Ralph loops (validation-before-close per bead)
  ↓ (all validated and closed)
Done
```

## Critical Rules

1. **Never skip Phase 1** - No assumptions
2. **Never start Phase 3 without Phase 2 complete** - All beads upfront
3. **Never close a bead without validation-before-close passing** - Use the skill!
4. **Never batch closes** - Validate each bead individually
5. **Always create bug beads for issues** - Track problems properly

---

**This skill is the enforced workflow for entropy-wiki. Follow all three phases rigorously.**
