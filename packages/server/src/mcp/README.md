# Companion MCP Server

Exposes Companion as an MCP server for Claude Code — enabling self-orchestration.

## Setup

Add to your Claude Code MCP config (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "companion": {
      "command": "bun",
      "args": ["run", "D:/Project/Companion/packages/server/src/mcp/index.ts"],
      "env": {
        "API_KEY": "your-api-key-here",
        "PORT": "3579"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `companion_list_sessions` | List all active sessions |
| `companion_spawn_session` | Create a new Claude Code session |
| `companion_send_message` | Send message to a session |
| `companion_get_session` | Get session details + recent messages |
| `companion_get_project_context` | Project info, sessions, channels |
| `companion_create_channel` | Create shared channel (debate/review/brainstorm) |
| `companion_send_to_channel` | Post to shared channel with role |
| `companion_read_channel` | Read channel messages |

## Architecture

```
Claude Code → stdio → Companion MCP Server → HTTP API → Companion Server
```

MCP server is stateless — all data flows through the Companion HTTP API.
