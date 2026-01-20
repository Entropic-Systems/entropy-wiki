# Core Concepts

Claude Code's power comes from four building blocks: Skills, Hooks, Commands, and Agents. Master these to become a true Droid overlord.

## Skills

Skills are reusable workflows you invoke with slash commands.

```bash
/commit          # Smart git commit
/fix             # Debug and fix issues
/review          # Code review workflow
```

### Creating Skills

Skills live in `.claude/skills/` as markdown files:

```markdown
# My Skill

Description of what this skill does.

## Trigger

/my-skill

## Workflow

1. Step one
2. Step two
3. Step three
```

### Why Skills Matter

- **Consistency** - Same workflow every time
- **Reusability** - Define once, use everywhere
- **Shareability** - Check into git, share with team

## Hooks

Hooks run code in response to events. They're how you automate Claude Code.

### Hook Types

| Hook | When it Fires |
|------|---------------|
| `PreToolUse` | Before Claude uses a tool |
| `PostToolUse` | After a tool completes |
| `SessionStart` | When Claude starts |
| `Stop` | When Claude finishes |

### Example Hook

```javascript
// .claude/hooks/pre-commit.js
export default {
  event: "PreToolUse",
  tool: "Bash",
  match: (cmd) => cmd.includes("git commit"),
  action: () => {
    console.log("Running pre-commit checks...");
  }
};
```

## Commands

Commands are built-in actions you can invoke:

| Command | What it Does |
|---------|--------------|
| `/help` | Show available commands |
| `/clear` | Clear conversation |
| `/compact` | Compress context |
| `/plan` | Enter planning mode |

## Agents (Sub-agents)

Claude Code can spawn specialized sub-agents for parallel work:

```
Main Claude
    ├── Scout Agent (research)
    ├── Kraken Agent (implementation)
    └── Arbiter Agent (testing)
```

### When to Use Sub-agents

- Large tasks that can be parallelized
- Different expertise needed (research vs implementation)
- Long-running operations you want to background

### Spawning Agents

Use the Task tool with `subagent_type`:

```
Task(
  subagent_type="scout",
  prompt="Research authentication patterns"
)
```

## Putting It Together

A typical workflow combines all four:

1. **Skill** triggers the workflow (`/implement-feature`)
2. **Hook** runs validation before tool calls
3. **Command** enters plan mode for complex work
4. **Sub-agents** parallelize research and implementation

This is orchestration - coordinating AI agents to complete complex tasks autonomously.
