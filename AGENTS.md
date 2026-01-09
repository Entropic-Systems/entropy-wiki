# Agent Instructions

## Project Context

**entropy-wiki** is a cyber-utilitarian monorepo for AI skills, prompts, and MCP toolsets. We capture the chaos of real systems, compress it, and ship it as repeatable advantage.

**Architecture:**
- `docs/beads/`: Atomic logic snippets
- `docs/skills-bank/`: Functional capabilities
- `docs/prompt-bank/`: Categorized, high-performance prompts
- `docs/tooling-mcp/`: MCP server configs, custom tool definitions, API bridge logic
- `docs/orchestration/`: Multi-agent handoff protocols and state-management
- `docs/context/`: MAP.md strategies, context pruning, token saving
- `docs/lab/`: Learnings, failure logs, model-specific quirks

**Standards:**
- Keep entries short, dense, and operational
- If a file can't be executed, it should at least be copy-pastable
- Avoid fluff—every line should increase capability or reduce ambiguity

---

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

