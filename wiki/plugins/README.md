# Plugins

Claude Code plugins extend the development environment with specialized capabilities for testing, iteration, design, and workflow automation.

## What are Plugins?

Plugins are packaged extensions that provide:
- **New skills** - Commands that orchestrate complex workflows
- **MCP servers** - Integration with external tools and services
- **Development patterns** - Proven methodologies for AI-assisted development

## Installed Plugins

This wiki documents the following plugins currently installed:

### Playwright
Browser automation for visual testing, functional validation, and layout debugging. Enables systematic frontend testing through MCP integration.

[Learn more →](./playwright)

### Ralph Loop
Iterative development methodology based on continuous AI loops. Implements the "Ralph Wiggum" technique for self-correcting, autonomous task completion.

[Learn more →](./ralph-loop)

### Frontend Design
Production-grade interface creation with bold aesthetic direction. Generates distinctive, polished frontend code that avoids generic AI patterns.

[Learn more →](./frontend-design)

### GitHub CLI Integration
Native GitHub operations through the `gh` command. Enables PR creation, issue management, and repository operations directly from Claude Code.

[Learn more →](./github)

## Plugin Capabilities Summary

| Plugin | Primary Use Case | Key Features |
|--------|-----------------|--------------|
| **Playwright** | Frontend testing & validation | Visual regression, functional testing, layout debugging |
| **Ralph Loop** | Iterative development | Self-correcting loops, autonomous refinement |
| **Frontend Design** | UI/UX creation | Bold aesthetics, production-grade code |
| **GitHub CLI** | Repository operations | PRs, issues, code review integration |

## Integration with Development Skills

These plugins enhance existing development skills:

- **validation-before-close** → Uses Playwright for frontend validation
- **git-workflow** → Enhanced by GitHub CLI for PR creation
- **task-intake** → Can leverage Ralph Loop for autonomous execution
- **frontend-design** → Direct skill for UI work

## Getting Started

Each plugin has specific setup requirements:

1. **Playwright**: Requires MCP server configuration in `.mcp.json`
2. **Ralph Loop**: Built-in, available via `/ralph-loop` command
3. **Frontend Design**: Built-in, available via `/frontend-design` skill
4. **GitHub CLI**: Requires `gh` CLI installation and authentication

Refer to individual plugin pages for detailed setup and usage instructions.
