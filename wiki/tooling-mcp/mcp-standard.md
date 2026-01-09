## MCP_STANDARD || VER: 1.0.2

> [!NOTE]
> Purpose: Document and share MCP server configurations between two operators with zero ambiguity.

### Required Sections
- **Server Identity**: Name, owner, repo, contact.
- **Runtime**: Node/Python version, OS target, start command.
- **Capabilities**: Tools, resources, prompts exposed.
- **Auth**: Tokens, scopes, rotation policy.
- **Network**: Ports, endpoints, CORS rules.
- **Security**: Sandboxing, file access, secrets storage.
- **Change Log**: Version, date, breaking changes.

### Share Protocol
1. Export server config and tool schema.
2. Redact secrets; replace with placeholders.
3. Provide a verified start command and health check.
4. Sync via repo PR or direct file drop in `docs/tooling-mcp/`.

> [!TIP]
> Include one minimal usage example per tool. Keep outputs deterministic.

> [!CAUTION]
> Never paste real keys. Use `REDACTED_*` placeholders and describe where they live.
