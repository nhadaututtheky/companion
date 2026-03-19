# Phase 5: Agent Platform

## Goal
Make Companion an MCP server that Claude can use to self-orchestrate. Enable multi-agent debate, shared context channels, and structured collaboration — all controllable from Telegram with natural language.

## Core Concept
Claude on Telegram can say "gọi thêm 1 Claude review đi" → current Claude calls `companion.spawn_session()` MCP tool → new Claude joins shared channel → they debate → verdict delivered back to Telegram.

## Tasks

### 5.1 Companion MCP Server
- [ ] Create MCP server module (`packages/server/src/mcp/server.ts`)
- [ ] Register Companion as MCP server in Claude Code config
- [ ] Implement MCP tools:
  - [ ] `companion.spawn_session` — create new session in same project, with role + shared channel
  - [ ] `companion.send_to_channel` — post message to shared channel
  - [ ] `companion.read_channel` — get messages from shared channel (with pagination)
  - [ ] `companion.conclude` — end debate, trigger Judge to synthesize verdict
  - [ ] `companion.get_project_context` — retrieve current project state (recent files, decisions, active sessions)
  - [ ] `companion.list_sessions` — list active sessions in project
  - [ ] `companion.get_session_summary` — get auto-generated summary of a session
- [ ] MCP transport: stdio (for local Claude Code) + HTTP (for remote agents)

### 5.2 Shared Channels
- [ ] Add `channels` table: `id, project_id, type (debate|review|brainstorm), status, created_at`
- [ ] Add `channel_messages` table: `id, channel_id, agent_id, role, content, timestamp`
- [ ] Channel lifecycle: create → active → concluding → concluded
- [ ] Agents subscribe to channel via polling or WS
- [ ] Auto-inject shared channel context when spawning new session

### 5.3 Debate Mode
- [ ] Implement debate formats:
  - [ ] **Pro vs Con** — 2 agents + Judge, structured rounds
  - [ ] **Red Team** — 1 Builder + 1 Attacker, security/flaw focus
  - [ ] **Review** — 1 Author + 1-3 Reviewers, code/architecture review
  - [ ] **Brainstorm** — N agents equal, Synthesizer concludes
- [ ] Convergence detection: Judge checks after each round
  - [ ] Extract key points from each agent's arguments
  - [ ] Compare overlap → if >70% converge, auto-conclude
  - [ ] Detect circular arguments (2 rounds no new points → stop)
- [ ] Hard limits: max rounds configurable (default 5), max cost per debate
- [ ] Human controls via Telegram:
  - [ ] `/debate <topic>` — start debate with default format (Pro vs Con)
  - [ ] `/debate review` — start code review debate
  - [ ] `/debate red-team` — start red team analysis
  - [ ] `/stop` or `/verdict` — force conclude at any time
  - [ ] Inject messages into debate (just type normally)
- [ ] Structured verdict output:
  - [ ] Winner/recommendation
  - [ ] Points of agreement
  - [ ] Key arguments per side
  - [ ] Unresolved points
  - [ ] Confidence score

### 5.4 Telegram Integration
- [ ] Route debate messages to Telegram with agent labels:
  - 🔵 Claude (Builder): ...
  - 🔴 Claude (Reviewer): ...
  - ⚖️ Verdict: ...
- [ ] Support inline replies to specific agent
- [ ] Debate summary card when concluded (formatted HTML)
- [ ] Cost tracking per debate (sum of all agent sessions)

### 5.5 Session Auto-Summary
- [ ] On session end, generate summary via Haiku call (200 words max)
- [ ] Store in `session_summaries` table
- [ ] Auto-inject last 3 summaries when new session starts in same project
- [ ] Summaries queryable via MCP tool `companion.get_session_summary`

### 5.6 Message History
- [ ] ALL messages stored in `session_messages` regardless of source:
  - [ ] Telegram user messages
  - [ ] Claude responses
  - [ ] Agent-to-agent debate messages
  - [ ] Permission requests/responses
  - [ ] System events (session start/end, cost updates)
- [ ] Web UI can display full conversation history
- [ ] Search across message history
- [ ] Export session as markdown

## Schema Additions
```sql
-- Shared channels for multi-agent collaboration
channels:
  id TEXT PRIMARY KEY
  project_id TEXT REFERENCES projects(id)
  type TEXT -- 'debate' | 'review' | 'red_team' | 'brainstorm'
  topic TEXT
  format TEXT -- debate format config JSON
  status TEXT -- 'active' | 'concluding' | 'concluded'
  max_rounds INTEGER DEFAULT 5
  current_round INTEGER DEFAULT 0
  verdict TEXT -- structured verdict JSON
  created_at INTEGER
  concluded_at INTEGER

-- Messages within a shared channel
channel_messages:
  id TEXT PRIMARY KEY
  channel_id TEXT REFERENCES channels(id)
  agent_id TEXT -- which Claude instance
  role TEXT -- 'advocate' | 'challenger' | 'judge' | 'reviewer' | 'human'
  content TEXT
  round INTEGER
  timestamp INTEGER

-- Auto-generated session summaries
session_summaries:
  id TEXT PRIMARY KEY
  session_id TEXT REFERENCES sessions(id)
  summary TEXT
  key_decisions TEXT -- JSON array
  files_modified TEXT -- JSON array
  created_at INTEGER
```

## Acceptance Criteria
- [ ] Claude on Telegram can spawn another Claude via natural language
- [ ] Two Claudes debate in shared channel, messages visible on Telegram
- [ ] `/debate "topic"` starts structured debate from Telegram
- [ ] `/verdict` or `/stop` forces conclusion at any point
- [ ] Verdict is structured (winner, arguments, unresolved points)
- [ ] Max rounds + cost limit prevents runaway debates
- [ ] Convergence detection stops debate when agents agree
- [ ] All debate messages stored in Companion DB
- [ ] Web UI shows full debate history with agent labels
- [ ] Session summaries auto-generated and injected into new sessions
- [ ] Companion MCP tools discoverable via `tools/list`

## Files Touched
- `packages/server/src/mcp/server.ts` — new (MCP server core)
- `packages/server/src/mcp/tools.ts` — new (tool definitions)
- `packages/server/src/mcp/transport.ts` — new (stdio + HTTP transport)
- `packages/server/src/services/channel-manager.ts` — new
- `packages/server/src/services/debate-engine.ts` — new
- `packages/server/src/services/convergence-detector.ts` — new
- `packages/server/src/services/session-summarizer.ts` — new
- `packages/server/src/db/schema.ts` — modify (add channels, channel_messages, session_summaries)
- `packages/server/src/telegram/telegram-commands.ts` — modify (add /debate, /verdict)
- `packages/server/src/telegram/telegram-formatter.ts` — modify (debate message formatting)
- `packages/server/src/routes/channels.ts` — new (REST API for channels)
- `packages/web/src/app/debates/page.tsx` — new (debate history view)
- `packages/web/src/app/debates/[id]/page.tsx` — new (debate detail view)

## Dependencies
- Requires Phase 2 completed (sessions, WS bridge, CLI launcher)
- Requires Phase 3 completed (Telegram commands, message routing)
- Phase 4 (Web UI) is parallel — debate works without web UI via Telegram
