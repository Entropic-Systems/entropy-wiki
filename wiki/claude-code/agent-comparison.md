# Agent Comparison

Claude Code, Codex, and Amp are all AI coding agents that work similarly. Understanding their differences helps you choose the right tool - or use them all strategically.

## The Big Picture

These agents share the same paradigm:
- Terminal/CLI-based interaction
- File system access
- Command execution
- Agentic loops (work until task complete)

The main differences? Provider, pricing, and specific capabilities.

## Why Multiple Agents?

Smart developers use multiple agents because:

1. **Cost optimization** - Spread usage across different pricing tiers
2. **Capability matching** - Some tasks suit certain models better
3. **Availability** - Fallback when one service is down
4. **Plan limits** - Work around monthly caps

## Comparison Table

| Feature | Claude Code | Codex (OpenAI) | Amp |
|---------|-------------|----------------|-----|
| Provider | Anthropic | OpenAI | Sourcegraph |
| Model | Claude | GPT-4 | Various |
| Skills system | Yes | No | No |
| Hooks (events) | Yes | Limited | No |
| MCP support | Yes | No | Limited |
| Sub-agents | Yes | No | No |
| Terminal-native | Yes | Yes | Yes |

## Why Claude Code is the Focus

This wiki focuses on Claude Code because it has the most extensible architecture:

### Skills
Reusable workflows you can invoke with `/skill-name`. Build once, use everywhere.

### Hooks
Event-driven automation. Run code when Claude starts, before tool calls, or on completion.

### MCP Servers
Model Context Protocol extends Claude's capabilities. Add browser automation, database access, or custom tools.

### Sub-agents
Spawn specialized agents for parallel work. One agent researches while another implements.

## When to Use Each

| Use Case | Best Agent |
|----------|------------|
| Complex multi-step workflows | Claude Code (skills) |
| Browser testing | Claude Code (Playwright MCP) |
| Quick code generation | Any |
| Large refactors | Claude Code (sub-agents) |
| Budget-conscious work | Rotate based on pricing |

## Practical Strategy

1. **Primary**: Claude Code for complex work requiring skills/hooks
2. **Secondary**: Codex or Amp for simpler tasks
3. **Rotate**: Spread usage to stay under plan limits

The techniques you learn here apply to all agents - orchestration patterns are universal.
