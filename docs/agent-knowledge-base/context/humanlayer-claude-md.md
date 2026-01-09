# CLAUDE.md Specification Summary

## Recommended Length
The article specifies that **CLAUDE.md files should be under 300 lines**, with shorter being preferable. HumanLayer's own root file is less than 60 lines.

## What to Include

The file should cover three essential areas:

1. **WHAT** – Technical stack and project structure. "Give Claude a map of the codebase," particularly important for monorepos where you clarify apps, shared packages, and their purposes.

2. **WHY** – Project purpose and the function of different components so Claude understands the system's intent.

3. **HOW** – Practical workflow information: build tools (e.g., `bun` vs `node`), test execution, verification methods, and compilation steps needed for meaningful work.

## What to Avoid

The article explicitly recommends against:

- **Code style guidelines** – "Never send an LLM to do a linter's job." Use deterministic linters instead.
- **Excessive instructions** – Frontier LLMs can reliably follow "~150-200 instructions." Since Claude Code's system prompt already contains ~50 instructions, space is limited.
- **Task-specific details** – Avoid including instructions about scenarios unrelated to universal workflows (e.g., database schema guidance when working on unrelated features).
- **Auto-generation** – Don't use `/init` or auto-generate the file; manually craft it as a "high-leverage point of the harness."

## Key Strategy: Progressive Disclosure

Store task-specific guidance in separate markdown files (`agent_docs/building_the_project.md`, etc.) and reference them in CLAUDE.md rather than embedding everything directly.

**Technical Value for Agents:** Keep under 300 lines. Include "Physics" (build commands, test runners) not history. Save tokens for reasoning. Use progressive disclosure for task-specific details.

**URL:** https://www.humanlayer.dev/blog/writing-a-good-claude-md
