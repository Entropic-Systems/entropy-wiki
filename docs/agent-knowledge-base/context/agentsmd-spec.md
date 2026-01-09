# AGENTS.md Specification Summary

## Core Definition

AGENTS.md is a vendor-neutral markdown format designed to guide AI coding agents. As stated on the official site: "A simple, open format for guiding coding agents, used by over 60k open-source projects."

## Schema & Structure

Rather than enforcing a rigid schema, AGENTS.md intentionally remains flexible. The specification explicitly states: "AGENTS.md is just standard Markdown. Use any headings you like; the agent simply parses the text you provide."

Common sections include:
- Project overview
- Build and test commands
- Code style guidelines
- Testing instructions
- Security considerations
- PR/commit message guidelines

## Agent Personas & Boundaries

The format doesn't define specific agent personas but rather creates "a dedicated, predictable place to provide the context and instructions" for any AI coding agent to operate effectively.

**Key boundary principle**: "The closest AGENTS.md to the edited file wins; explicit user chat prompts override everything." This establishes a hierarchy where nested files (in monorepos) take precedence over parent directories.

## Vendor Neutrality

AGENTS.md works across 25+ compatible tools including OpenAI Codex, Google's Jules, GitHub Copilot, Cursor, Aider, VS Code, and others. The format deliberately avoids proprietary constraints, making it ecosystem-agnostic by design.

**Technical Value for Agents:** Vendor-neutral alternative to CLAUDE.md. Defines schema for Agent Personas and boundaries. Flexible markdown format supported by 25+ tools.

**URL:** https://agents.md/
