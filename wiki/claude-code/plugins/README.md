# Plugins

Plugins extend Claude Code with specialized capabilities via MCP (Model Context Protocol) servers.

## Available Plugins

### [Playwright](./playwright)
Browser automation for visual testing, functional validation, and layout debugging.

### [GitHub CLI](./github)
Native GitHub operations - PRs, issues, code review directly from Claude Code.

### [Frontend Design](./frontend-design)
Production-grade UI creation with bold aesthetic direction.

### [Wiki Ingest](./wiki-ingest)
Content capture and wiki entry creation.

## How Plugins Work

Plugins are MCP servers that give Claude new tools:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp"]
    }
  }
}
```

Once configured, Claude can use browser automation:

```javascript
browser_navigate("http://localhost:3000")
browser_take_screenshot({ fullPage: true })
browser_click({ element: "submit button", ref: "submit-btn" })
```

## Why MCP Matters

MCP is Claude's extension system. It lets you:

- Add new capabilities without modifying Claude
- Share plugins across projects
- Build custom tools for your workflow

Think of MCP servers as "apps" for Claude Code.
