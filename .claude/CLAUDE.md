# Project Workflow

## Task Intake Process

**CRITICAL**: When receiving ANY non-trivial task, follow this workflow:

### Phase 1: Clarification (REQUIRED FIRST)
1. **ALWAYS use ask-questions-if-underspecified skill FIRST**
2. Ask ALL clarifying questions upfront
3. Get ALL design decisions before implementation
4. Settle ambiguities before writing code

### Phase 2: Planning
1. Create bead for strategic work
2. Check relevant references (ClaudeDocs, CodexDocs)
3. Identify DoD criteria for work type
4. Plan validation approach

### Phase 3: Autonomous Execution
1. Implement with ralph wiggum validation loops
2. NO mid-implementation clarification questions
3. All decisions were made in Phase 1
4. Auto-create bug beads for issues
5. Validate continuously until DoD met

### Phase 4: Completion
1. **INVOKE validation-before-close skill** (MANDATORY)
2. Verify: build passes, tests pass, changes work
3. Update documentation if needed
4. Close bead only after validation passes
5. Suggest compaction if needed

> **HOOK ENFORCED**: A PreToolUse hook runs on all `bd close` commands
> and outputs a validation reminder. Do not ignore this reminder.

## Core Principle

**Front-load ALL decision-making so loops can run autonomously without human intervention.**

If you realize you need clarification during implementation:
- ❌ DON'T: Stop and ask mid-implementation
- ✅ DO: Note what you need, continue with reasonable assumption, ask at next natural breakpoint

## Work Types Requiring Clarification Phase

- ✅ New features (always ask upfront)
- ✅ Significant refactoring
- ✅ Architecture changes
- ✅ API changes
- ✅ Configuration changes
- ❌ Simple bug fixes (skip if obvious)
- ❌ Typo fixes
- ❌ Documentation updates (skip if straightforward)

## Standing Instructions

1. **Beads**: Create beads for all strategic work
2. **Questions**: Ask upfront, not during loops
3. **Validation**: Use ralph wiggum loops continuously
4. **Documentation**: Auto-update when changes are significant
5. **Context**: Monitor usage, suggest compaction proactively
6. **Models**: Use appropriate model for task complexity

## Validation Requirements (CRITICAL)

Before closing ANY bead, you MUST:

1. **Invoke validation-before-close skill** - determines appropriate validation level
2. **Run build**: `npm run build` must pass
3. **Run tests**: if tests exist, they must pass
4. **Verify functionality**: manually test if needed
5. **Check for regressions**: ensure existing features still work

**NEVER close a bead with:**
- Failing builds
- Failing tests
- Untested changes
- "I assume it works" reasoning

**If validation fails:**
1. Create bug bead for the issue
2. Fix the issue
3. Re-validate
4. THEN close the original bead
