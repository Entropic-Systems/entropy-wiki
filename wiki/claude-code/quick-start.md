# Quick Start Guide

Get from zero to commanding AI agents in 5 minutes.

## Step 1: Install Claude Code

```bash
# Install via npm
npm install -g @anthropic/claude-code

# Or via Homebrew
brew install claude-code
```

## Step 2: Start a Session

Navigate to your project and run:

```bash
cd your-project
claude
```

Claude Code will:
1. Read your codebase
2. Start an interactive session
3. Wait for your instructions

## Step 3: Give Your First Command

Try something simple:

```
> Explain the structure of this codebase
```

Claude will analyze your project and give you an overview.

## Step 4: Make Changes

Now try making a change:

```
> Add a README.md with project documentation
```

Watch as Claude:
1. Analyzes what documentation would be useful
2. Creates the file
3. Shows you the result

## Step 5: Use a Skill

Skills are pre-built workflows. Try the commit skill:

```
> /commit
```

This will:
1. Check git status
2. Stage appropriate changes
3. Generate a commit message
4. Create the commit (with your approval)

## What's Next?

You just commanded an AI agent to do your bidding. Here's where to go deeper:

### Learn Claude Code Fundamentals
- [Introduction](./introduction) - What Claude Code is
- [Core Concepts](./core-concepts) - Skills, hooks, commands, agents
- [Plugins](./plugins) - Extend with MCP servers

### Understand Orchestration
- [What is Orchestration?](/orchestration/introduction) - Multi-agent coordination basics
- [Patterns](/orchestration/patterns) - Workflow patterns like Ralph Loop
- [Memory](/orchestration/memory) - Persistent context with Beads

### Compare Agents
- [Agent Comparison](./agent-comparison) - Claude Code vs Codex vs Amp

## Pro Tips

**Use clear instructions**
```
# Good
"Add a login form with email and password fields"

# Too vague
"Add auth"
```

**Let Claude iterate**
Claude can run tests, see failures, and fix them. Give it room to work.

**Use skills for common tasks**
Instead of describing a commit workflow, just use `/commit`.

**Read the context**
Claude reads your codebase. The more context it has, the better it performs.

## Common First Commands

| Command | What it Does |
|---------|--------------|
| `Explain this codebase` | Get an overview |
| `Add tests for X` | Generate test coverage |
| `Fix the error in Y` | Debug and fix issues |
| `/commit` | Smart git commit |
| `/help` | See available commands |

Welcome to being a Droid overlord.
