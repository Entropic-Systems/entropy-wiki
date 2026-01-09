# MCP Inspector Summary

## Purpose
MCP Inspector serves as a comprehensive developer tool for testing and debugging Model Context Protocol servers. According to the documentation, "The MCP inspector is a developer tool for testing and debugging MCP servers."

## Core Architecture
The tool consists of two integrated components:

1. **MCP Inspector Client (MCPI)**: A React-based web interface enabling interactive server testing
2. **MCP Proxy (MCPP)**: A Node.js bridge connecting the UI to MCP servers via stdio, SSE, or streamable-HTTP transports

## Key Capabilities

**Resource & Prompt Verification:**
The inspector allows developers to explore and validate server resources through an interactive browser interface with hierarchical navigation and JSON visualization. Users can also test prompt capabilities programmatically.

**Usage Examples:**
- List available tools: `npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list`
- Call specific tools with parameters for testing functionality
- Connect to remote servers via SSE or HTTP transports
- Export server configurations for use in clients like Cursor or Claude Code

## Operational Modes

**UI Mode** provides visual debugging with request history and real-time responses, ideal for development and exploration.

**CLI Mode** enables scriptable automation, supporting batch processing and integration with coding assistants for rapid feedback loops during server development.

**Technical Value for Agents:** Essential for verifying MCP servers expose resources and prompts correctly before deployment. Enables debugging of tool configurations and parameter validation.

**URL:** https://github.com/modelcontextprotocol/inspector
