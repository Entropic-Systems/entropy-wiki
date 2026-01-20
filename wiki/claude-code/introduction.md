# Introduction to Claude Code

Claude Code is Anthropic's terminal-based AI coding assistant. It's not just another chatbot - it's a full development environment that can read, write, and execute code autonomously.

## Why Claude Code?

Claude Code stands out from other AI coding tools because it:

- **Runs in your terminal** - Native CLI experience, not a web app
- **Has file system access** - Reads and writes files directly
- **Executes commands** - Runs tests, builds, and git operations
- **Supports MCP** - Model Context Protocol for extending capabilities
- **Skills & Hooks** - Customize behavior with reusable patterns

## Core Architecture

```
┌─────────────────────────────────────────┐
│              Claude Code                │
├─────────────────────────────────────────┤
│  Skills     │  Hooks      │  Commands   │
│  (workflows)│  (events)   │  (actions)  │
├─────────────────────────────────────────┤
│           MCP Servers                   │
│  (Playwright, GitHub, Filesystem, etc.) │
├─────────────────────────────────────────┤
│         Your Codebase                   │
└─────────────────────────────────────────┘
```

## Getting Started

1. Install Claude Code from Anthropic
2. Run `claude` in your project directory
3. Start giving instructions

That's it. Claude Code will read your codebase and help you build.

## Next Steps

- [Agent Comparison](./agent-comparison) - See how Claude Code compares to Codex and Amp
- [Core Concepts](./core-concepts) - Learn about skills, hooks, and commands
- [Plugins](./plugins) - Extend with browser automation and more
