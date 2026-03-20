# Phase 5: Agent Platform — Companion MCP Server

## Overview
Make Companion an MCP server so Claude can self-orchestrate: spawn sessions, debate, share context. This is the moat feature — transforms Companion from "Claude UI wrapper" to "AI agent fleet management platform".

## Phases (split into sub-phases for manageability)

### 5A: MCP Server Core (1 session)
- [ ] Create `packages/server/src/mcp/server.ts` — MCP server using @modelcontextprotocol/sdk
- [ ] Transport: stdio (for local Claude Code) + HTTP/SSE (for remote)
- [ ] Register in Claude Code config as MCP server
- [ ] Implement 4 core tools:
  - `companion.spawn_session` — create new session with project + role
  - `companion.list_sessions` — list active sessions
  - `companion.send_message` — send message to another session
  - `companion.get_session_summary` — get session state + recent messages

### 5B: Shared Channels (1 session)
- [ ] DB tables already exist (channels, channel_messages)
- [ ] Implement ChannelManager service (skeleton exists)
- [ ] MCP tools:
  - `companion.create_channel` — create debate/review/brainstorm channel
  - `companion.send_to_channel` — post to shared channel
  - `companion.read_channel` — get channel messages
  - `companion.conclude_channel` — end channel, trigger verdict
- [ ] Web UI: channel panel in session sidebar (skeleton exists)

### 5C: Debate Mode (1-2 sessions)
- [ ] Debate engine: Pro vs Con, Red Team, Review, Brainstorm formats
- [ ] Convergence detection (overlap check, circular argument detection)
- [ ] Judge role — synthesize verdict
- [ ] Telegram integration: `/debate <topic>`, `/verdict`, `/stop`
- [ ] Structured verdict output (winner, arguments, unresolved, confidence)
- [ ] Cost tracking per debate

### 5D: Session Auto-Summary (1 session)
- [ ] On session end, call Haiku for 200-word summary
- [ ] Store in session_summaries table (exists)
- [ ] Auto-inject last 3 summaries into new sessions (same project)
- [ ] Queryable via MCP tool

## Key Decisions
- MCP SDK over raw protocol — less code, auto tool/list
- stdio + HTTP dual transport — works locally and remotely
- Debate is opt-in — doesn't affect normal sessions
- Haiku for summaries — cheap, fast, good enough

## Dependencies
- Phase 1-4 done ✅
- @modelcontextprotocol/sdk package needed
- Debate needs multi-session spawning working first (5A)

## Recommended Order
5A → 5D → 5B → 5C (each is 1 session of work)
