# 1DevTool v1.11.0 — Deep Analysis for Companion v3

> Source: D:\Project\1DevTool
> Analyzed: 2026-04-02

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | **Electron** + electron-updater |
| Frontend | **React** + Zustand + Monaco Editor |
| Terminal | **node-pty** + **xterm.js** (WebGL renderer) |
| Real-time | **Socket.io** |
| Persistence | **electron-store** (JSON-backed) |
| DB Clients | Postgres, MySQL, MongoDB, Redis, Cassandra, ClickHouse, MSSQL, SurrealDB... (10+) |
| Diagrams | Mermaid + Viz.js |
| Error tracking | Sentry |

**Scale**: 174+ IPC endpoints across 22 categories

---

## 1. Terminal System

### Two-tier spawning:
- **Direct PTY** (AI agents) — `node-pty.spawn()` directly
- **Tmux persistence** (shell terminals) — session survives app restart

### 7 AI Agent types:

| Agent | Command | Auto-Resume | Session Detect | Color |
|-------|---------|-------------|----------------|-------|
| Claude Code | `claude` | Yes | Yes | #F59E0B |
| Codex | `codex` | Yes | Yes | #10B981 |
| Gemini CLI | `gemini` | No | Yes | #8B5CF6 |
| Amp | `amp` | Yes | No | #EC4899 |
| OpenCode | `opencode` | No | No | #3B82F6 |
| Cline | `cline` | No | No | #06B6D4 |
| Qoder | `qoder` | No | No | #F97316 |

### Smart features:
- **Virtual Screen Reconstruction** — solves TUI apps (Claude Code) drawing at specific cursor positions, avoids garbled output. Reconstructs 2D character grid from raw PTY output (120 cols, 500 rows scrollback)
- **Output buffering**: 5MB/terminal, ANSI sanitization
- **Session resume**: Scans `~/.claude/sessions/`, `~/.codex/sessions/` etc., atomic claiming (prevents 2 terminals binding same session)
- **Idle detection**: 500ms for command completion, 2000ms for agent idle → notification
- **70+ startup presets**: npm dev, vite, jest, docker-compose, prisma studio, rails...
- **Prompt history tracking**: Parses escape sequences, saves each user prompt per terminal

### Layout system:
- Grid (Cmd+1), Columns (Cmd+2), Single (Cmd+3), Vertical Tabs (Cmd+5), Canvas (Cmd+6)
- Font size per-terminal (bypasses Chromium zoom)

---

## 2. Agent Channels — Multi-Agent Orchestration

### Architecture:
```
channelHub.js      → Channel CRUD, message persistence, terminal locking
channelOperator.js → @mention routing, prompt queuing, agent dispatch
channel-mcp/       → HTTP bridge exposing channels as MCP endpoints
```

### Supported agents:
Claude, Codex, Gemini, Amp, OpenCode, Cline, Qoder — with model selection per agent:
```js
OPERATOR_AGENTS: [
  { value: 'claude', models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-6'] },
  { value: 'codex', models: ['o4-mini', 'o3', 'gpt-4.1'] },
  { value: 'gemini', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
]
```

### Channel workflow (Multi-Agent Build example):
```
User selects "Multi-Agent Build" template
  → Select 3 agents: Planner (Claude), Builder (Codex), Verifier (Gemini)
  → Auto-generate prompt chain:
     @ Planner: Plan the implementation
     @ Builder: Implement it based on the plan
     @ Verifier: Verify the implementation is correct
  → channelOperator routes messages sequentially via @mention
  → Terminal locking prevents concurrent agent writes
```

### MCP Bridge (killer feature):
- HTTP server exposes channels for external agents
- Endpoints: `/operator/run`, `/operator/wait-for-idle`, `/agent/list-peers`, `/agent/send`, `/agent/mention`
- Port stored at `~/.1devtool/channel-mcp-bridge-port`
- External agents can join channels via HTTP

### Template categories:
- **REVIEW**: Plan Review, Code Review, PR Review (2 agents each)
- **BUILD**: Fix Bug, Implement Feature, Refactor Code, Debug Issue (2 agents)
- **TEST**: Unit Tests, Integration Tests, Performance Tests
- **DEPLOY**: Pre-deploy, Deploy, Post-deploy Checks

### Channel features:
- Scope: `app` (global) or project-scoped
- Linked projects & participants
- Settings: `maxSteps`, `timeout`, `operatorAgent`
- Status: active / paused / stopped
- Archive support
- Terminal locking (prevents concurrent agent access)
- Capture offset tracking (session recovery)

---

## 3. Built-in Dev Tools Panel

### Browser:
- Tab-based, multiple localhost previews
- URL bar + navigation controls + zoom
- Integrated directly in app — zero context switch

### HTTP Client:
- Full REST: GET/POST/PUT/PATCH/DELETE
- Auth: Bearer token, Basic auth
- Auto JSON detection, pretty-print response
- Latency tracking
- 30s timeout, graceful error handling

### Database Viewer:
- **10+ adapters**: Postgres, MySQL, MSSQL, MongoDB, CouchDB, Elasticsearch, InfluxDB, ClickHouse, Redis, Cassandra, Weaviate, SurrealDB, Kafka
- Query runner (multi-statement)
- Schema introspection
- Safe mode (blocks non-SELECT)
- Import/Export
- Row-level CRUD

---

## 4. Other Notable Systems

### Skills System (skills.js — 49K lines):
- Scan project + global skills
- **Risk detection**: 40+ regex patterns for prompt injection, dangerous commands, credential references
- Support 28+ agent tool paths (Claude, Cursor, Copilot, Windsurf, Continue, Cline...)
- Remote skill fetching + auditing
- Agent paths discovery:
```js
AGENT_PATHS = [
  { agent: 'Claude Code', tool: 'claude', projectDir: '.claude', globalDir: '.claude' },
  { agent: 'Cursor', tool: 'cursor', projectDir: '.agents', globalDir: '.cursor' },
  { agent: 'GitHub Copilot', tool: 'other', projectDir: '.agents', globalDir: '.copilot' },
  // ... 25+ more
]
```

### Docker Integration:
- Container/Image/Volume management
- Start/Stop/Pause/Restart/Remove
- Real-time log streaming
- Container stats monitoring

### Git Integration:
- Status, diff, branches, push/pull preview
- Raw command execution

### Remote Access:
- Peer-to-peer device pairing
- QR code pairing flow
- Permission management + audit log
- Socket.io terminal streaming

### Session Resume:
- Detect active sessions by scanning agent session dirs
- Atomic claiming prevents conflicts
- 10s grace period matching
- Works for Claude, Codex, Gemini

### Design MCP Server:
- Built-in design system knowledge base (charts, colors, landing, typography, UX guidelines)
- AI-powered design generation
- Export to PNG/SVG

### Project Management:
- Multi-project sidebar with accent color coding
- Per-project terminal storage
- Custom project ordering
- Preferences: workspace, appearance, behavior, browser, git accounts

---

## 5. Comparison: 1DevTool vs Companion

| Feature | 1DevTool | Companion | Gap Level |
|---------|----------|-----------|-----------|
| **Terminal** | node-pty + tmux + 7 agents | Claude-only via CLI spawn | **Critical** |
| **Agent orchestration** | Channels + MCP bridge + templates | Debate engine (4 formats) | **High** |
| **@mention routing** | Between any agent terminals | Between sessions (shortId) | **Medium** — Companion has this |
| **Built-in browser** | Yes (tabbed) | No | **Medium** |
| **HTTP client** | Full REST client | No | **Low** |
| **DB viewer** | 10+ adapters | No | **Low** |
| **Multi-project** | Color-coded sidebar | Single project Docker | **Medium** |
| **Session resume** | Multi-agent detection | Claude-only resume | **Medium** |
| **Skills/risk detection** | 40+ injection patterns | No skills system | **Medium** |
| **Docker management** | Full CRUD + logs | Docker compose only | **Low** |
| **Remote access** | P2P device pairing | No | **Low** |
| **Layout system** | 5 modes + per-terminal zoom | Basic single view | **High** |
| **Prompt history** | Per-terminal, searchable | No | **Medium** |
| **Design system MCP** | Built-in knowledge base | No | **Low** |
| **Verdict/convergence** | No (channels are sequential) | Yes — structured verdicts | **Companion wins** |
| **Cost control** | No | Yes — per-debate cost caps | **Companion wins** |
| **Telegram** | No | Yes | **Companion wins** |
| **Self-hosted Docker** | No (desktop only) | Yes — 1-click deploy | **Companion wins** |

---

## 6. Actionable Insights for Companion v3

### MUST LEARN (High impact, aligns with Companion vision):

#### A. Channel Templates System
- Pre-built workflow templates instead of just debate formats
- Categories: Review / Build / Test / Deploy
- User selects template → auto-assign roles → auto-generate prompt chain
- Companion already has a good debate engine, just needs to **expand formats** to Build/Test/Deploy workflows

#### B. Multi-Terminal Layout
- Grid/columns/single/tabs layout for multiple sessions
- Critical when user wants to watch 2-3 agents working in parallel
- Companion web UI needs split-pane support

#### C. MCP Bridge for Channels
- Expose channels via HTTP for external agent participation
- Bridge between "closed system" and "open ecosystem"
- Companion can use this pattern for multi-provider support (OpenRouter, Ollama)

#### D. Session Resume Intelligence
- Detect active sessions by scanning `~/.claude/sessions/`
- Atomic claiming prevents conflicts
- Companion already has resume but can improve detection logic

### SHOULD LEARN (Medium impact):

#### E. Virtual Screen Reconstruction
- Solves garbled TUI output — Companion likely faces this too
- 2D character grid reconstruction from raw PTY output

#### F. Skills Risk Detection
- 40+ regex patterns for prompt injection
- Dangerous command detection
- Companion should have this layer before allowing custom prompts

#### G. Startup Command Presets
- 70+ presets organized by category
- Quick start for common workflows

#### H. Prompt History
- Per-terminal searchable history
- Escape sequence parsing to extract clean prompts

### NICE TO HAVE (Low impact for Companion's use case):

- Built-in browser (users have their own browser)
- HTTP client (users have Postman/Insomnia)
- DB viewer (users have DataGrip/pgAdmin)
- Docker full CRUD (Companion only needs compose)
- Design MCP server
- Remote device pairing

---

## 7. Key Architecture Patterns Worth Adopting

### Terminal Spawning
```
1. Spawn-per-Terminal: Each terminal gets unique PTY instance
2. AI terminals skip tmux (direct PTY only)
3. Enriched PATH: Homebrew/package manager detection for cross-platform
4. Deferred Command Injection: 150ms delay for startup command
5. Escape Sequence Sanitization: Strip styling, preserve positioning
```

### Channel Orchestration
```
1. Template-driven: User picks template, system configures agents
2. Sequential @mention routing: Agent A finishes → route to Agent B
3. Terminal locking: Prevent concurrent writes to same terminal
4. MCP bridge: External agents join via HTTP
5. Capture offset tracking: Resume from where left off
```

### Session Management
```
1. Atomic session claiming via Map (prevent duplicate binding)
2. Agent-specific session directory scanning
3. 10s grace period for time-based matching
4. Detached session tracking (sessions survive app close)
```
