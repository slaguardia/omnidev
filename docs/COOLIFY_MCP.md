# Coolify: Use remote MCP servers from the same container

Goal: use MCP servers from this Coolify deployment (where Claude Code runs inside the container).

This setup uses **remote MCP servers** (hosted by the provider), and Claude Code makes **outbound** HTTPS calls to them.

## Remote MCP servers (recommended): Linear example

If the MCP server is already hosted publicly (like Linear), you just add it to Claude Code and the container makes **outbound** HTTPS calls to it.

### Auth note: OAuth MCP servers are not supported (token/API-key only)

This project currently supports **only API key / token-based auth** for MCP servers (for example, setting an `Authorization: Bearer <token>` header).

We **do not support OAuth-based MCP servers yet** (i.e. servers that require completing a browser login flow + redirect/callback to obtain tokens). We’re exploring a future approach that would involve registering this app (CodeSpider) as an OAuth app with each provider, but for now **use token-based MCP auth**.

### Example (Linear): Bearer token header

You can set this up either by:

- **Manually editing `~/.claude/.claude.json`** inside the container (recommended for precise control), or
- **Interacting with Claude** and telling it to configure the MCP server + headers for you.

Claude config example (`~/.claude/.claude.json`):

```json
{
  "mcpServers": {
    "linear-server": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  },
  "enabledMcpjsonServers": []
}
```

If you prefer to add the server first via CLI:

```bash
claude mcp add --scope user --transport http linear-server https://mcp.linear.app/mcp
```

Notes:

- **Use `--scope user`**: this makes the MCP server available in **all workspaces** (so it doesn’t matter what directory you run `claude mcp add` from).

Then edit `~/.claude/.claude.json` to add the `headers` block (as shown above).

That’s it — no container port changes required.

### Example (GitHub): PAT via prompt input

Some setups use an input prompt to avoid hard-coding tokens in the JSON:

```json
{
  "servers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${input:github_mcp_pat}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "github_mcp_pat",
      "description": "GitHub Personal Access Token",
      "password": true
    }
  ]
}
```
