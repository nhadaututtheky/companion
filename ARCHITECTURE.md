# Companion — System Architecture

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Clients                                   │
├──────────────────┬──────────────────┬──────────────────┐         │
│   Web Browser    │  Telegram Chats  │   MCP Clients    │         │
│  (Next.js 16)    │  (Grammy Bot)    │  (Tools)         │         │
└────────┬─────────┴────────┬─────────┴────────┬─────────┘         │
         │                  │                  │                   │
    WebSocket           HTTP POST          Stdio                   │
         │              Webhook             Stream                 │
         └──────────────┬──────────────────┬─────────────┘         │
                        │                  │                        │
         ┌──────────────▼──────────────────▼─────────────┐         │
         │       Hono HTTP Server (Port 3579)          │         │
         ├───────────────────────────────────────────────┤         │
         │  Middleware:                                 │         │
         │  • auth.ts (API Key verification)            │         │
         │  • rate-limiter.ts (Token bucket)            │         │
         └───────────────────┬───────────────────────────┘         │
                             │                                      │
         ┌───────────────────▼───────────────────┐                 │
         │          Routes (20 endpoints)        │                 │
         ├─────────────────────────────────────── │                 │
         │ • /api/sessions/...   (CRUD)          │                 │
         │ • /api/filesystem/... (Browse)        │                 │
         │ • /api/channels/...   (Debates)       │                 │
         │ • /api/telegram/...   (Webhook)       │                 │
         │ • /api/settings/...   (Key-value)     │                 │
         │ • /api/templates/...  (Prompts)       │                 │
         │ • /api/projects/...   (Config)        │                 │
         └───────────────────┬───────────────────┘                 │
                             │                                      │
         ┌───────────────────▼───────────────────────────────────┐ │
         │          Core Services (25 modules)                  │ │
         ├─────────────────────────────────────────────────────── │ │
         │ ▌ AI Integration                                      │ │
         │   ├─ ai-client.ts     (Claude API streaming)          │ │
         │   ├─ cli-launcher.ts  (Claude Code spawner) ⚠️DANGER   │ │
         │   └─ sdk-engine.ts    (Agent SDK wrapper)            │ │
         │                                                       │ │
         │ ▌ Session Management                                  │ │
         │   ├─ session-store.ts      (CRUD + lifecycle)         │ │
         │   ├─ session-summarizer.ts (Auto-summary)            │ │
         │   └─ ws-bridge.ts          (WS routing) 🔴CRITICAL    │ │
         │                                                       │ │
         │ ▌ Telegram Integration                                │ │
         │   ├─ bot-registry.ts       (Multi-bot manager)        │ │
         │   ├─ telegram-bridge.ts    (Chat↔Session mapper)      │ │
         │   ├─ stream-handler.ts     (Stream to Telegram)       │ │
         │   └─ commands/             (8 handlers)              │ │
         │                                                       │ │
         │ ▌ Debate/Collaboration                                │ │
         │   ├─ debate-engine.ts      (Multi-agent logic)        │ │
         │   ├─ convergence-detector.ts (End detection)          │ │
         │   └─ channel-manager.ts    (Channel lifecycle)        │ │
         │                                                       │ │
         │ ▌ Configuration & Security                            │ │
         │   ├─ license.ts            (License verification) ⚠️   │ │
         │   ├─ project-profiles.ts   (Project defaults)         │ │
         │   ├─ settings-helpers.ts   (Global settings)          │ │
         │   ├─ anti-cdp.ts           (Cursor blocker)          │ │
         │   ├─ anti-chat-watcher.ts  (Idle timeout)            │ │
         │   └─ anti-task-watcher.ts  (Task monitor)            │ │
         │                                                       │ │
         │ ▌ Templates & Utilities                               │ │
         │   ├─ templates.ts          (Template CRUD)            │ │
         │   └─ logger.ts             (Structured logging)       │ │
         └───────────────────┬───────────────────────────────────┘ │
                             │                                      │
         ┌───────────────────▼────────────────────┐               │
         │  Database Layer (Drizzle ORM)          │               │
         ├────────────────────────────────────────┤               │
         │  SQLite + 13 Tables:                   │               │
         │  • projects, sessions, sessionMessages  │               │
         │  • telegramBots, telegramSessionMappings              │
         │  • channels, channelMessages            │               │
         │  • sessionTemplates, sessionSummaries   │               │
         │  • settings, dailyCosts                │               │
         └───────────────────┬────────────────────┘               │
                             │                                      │
         ┌───────────────────▼────────────────────┐               │
         │  SQLite Database File                  │               │
         │  (data/companion.db)                   │               │
         └────────────────────────────────────────┘               │
         ┌────────────────────────────────────────┐               │
         │  MCP Server (stdio transport)           │               │
         ├────────────────────────────────────────┤               │
         │  Tools:                                │               │
         │  • read-file, write-file               │               │
         │  • execute-command, list-files         │               │
         │  • session-control, etc                │               │
         └────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Next.js Web (Port 3580)                       │
├─────────────────────────────────────────────────────────────────┤
│  Pages (App Router):                                            │
│  • / (Dashboard), /projects, /sessions, /sessions/[id]          │
│  • /settings, /templates                                        │
│                                                                 │
│  Components (30+):                                              │
│  • session/ (chat, composer, file viewer)                       │
│  • ring/ (Magic Ring circular UI)                               │
│  • grid/ (Session grid)                                         │
│  • settings/ (Telegram config)                                  │
│  • layout/ (Header, command palette)                            │
│                                                                 │
│  State (Zustand stores):                                        │
│  • session-store (messages, cost, status)                       │
│  • ui-store (theme, sidebar)                                    │
│  • ring-store (ring animation)                                  │
│  • activity-store (logs)                                        │
│  • composer-store (message input)                               │
│                                                                 │
│  Hooks:                                                         │
│  • use-session (fetch session data)                             │
│  • use-websocket (WebSocket connection)                         │
│  • use-voice-input (voice to text)                              │
│                                                                 │
│  Styling:                                                       │
│  • TailwindCSS v4                                               │
│  • Dark mode support                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Session Creation Flow

```
User clicks "New Session"
    ↓
Web UI → POST /api/sessions
    ↓
session-store.ts creates session (status: "starting")
    ↓
cli-launcher.ts or sdk-engine.ts starts Claude Code
    ↓
Session status → "active"
    ↓
WebSocket connection established (ws-bridge.ts)
    ↓
Web UI receives stream updates
```

### Message Flow

```
User types message in composer
    ↓
Web UI → POST /api/sessions/:id/message
    ↓
ai-client.ts streams Claude API
    ↓
Response streamed → sessionMessages table
    ↓
ws-bridge.ts broadcasts to connected clients
    ↓
Web UI updates message feed (real-time)
    ↓
Tokens/cost aggregated in session record
```

### Telegram Integration Flow

```
User sends message in Telegram
    ↓
Grammy bot receives (telegram-bridge.ts)
    ↓
Find or create session for chat ID
    ↓
Forward message to session
    ↓
Claude response streamed back
    ↓
stream-handler.ts chunks + sends to Telegram
    ↓
User sees response in chat
    ↓
Session metrics updated
```

### Debate Flow

```
User creates channel (debate topic)
    ↓
channel-manager.ts orchestrates agents
    ↓
debate-engine.ts coordinates agents:
    • Advocate presents position
    • Challenger presents counter-argument
    • Judge synthesizes verdict
    ↓
convergence-detector.ts checks if consensus reached
    ↓
If rounds < maxRounds, continue; else conclude
    ↓
channelMessages table stores all positions
    ↓
Web UI displays in Magic Ring UI
```

---

## Component Dependencies (Frontend)

### Page → Component → Store

```
/sessions/[id]
    ├─ session/message-feed.tsx ─→ session-store (messages)
    ├─ session/message-composer.tsx ─→ composer-store (draft, attachments)
    ├─ session/file-viewer.tsx ─→ session-store (selectedFile)
    ├─ session/session-details.tsx ─→ session-store (metadata)
    ├─ session/quick-actions.tsx ─→ [fetch templates]
    └─ use-websocket hook ─→ ws-bridge (real-time updates)

/
    ├─ dashboard/stats-grid.tsx ─→ [fetch /api/sessions]
    ├─ grid/session-grid.tsx ─→ session-store (sessionList)
    └─ activity/activity-terminal.tsx ─→ activity-store (logs)

/settings
    ├─ settings/telegram-bot-card.tsx ─→ [POST /api/telegram]
    ├─ settings/telegram-anti-settings.tsx ─→ [POST /api/settings]
    └─ settings/telegram-streaming.tsx ─→ [POST /api/settings]
```

---

## Service Dependencies (Backend)

```
index.ts (Startup)
    ├─ db/client.ts (SQLite connection)
    ├─ db/migrate.ts (Run migrations)
    ├─ license.ts (License verification)
    ├─ templates.ts (Seed defaults)
    └─ session-store.ts (Cleanup zombie sessions)

Routes:
    ├─ sessions.ts ──→ session-store.ts, ai-client.ts
    ├─ filesystem.ts ──→ [Node.js fs module]
    ├─ channels.ts ──→ channel-manager.ts, debate-engine.ts
    ├─ telegram.ts ──→ bot-registry.ts, telegram-bridge.ts
    ├─ settings.ts ──→ settings-helpers.ts
    └─ templates.ts ──→ templates.ts

Services:
    ai-client.ts ──→ Anthropic API (Claude)
    cli-launcher.ts ──→ Claude Code (subprocess)
    sdk-engine.ts ──→ Agent SDK
    ws-bridge.ts ──→ [browser WebSocket]

    session-store.ts ──→ SQLite (sessions table)
    session-summarizer.ts ──→ ai-client.ts

    telegram-bridge.ts ──→ session-store.ts
    stream-handler.ts ──→ [Telegram Bot API]
    bot-registry.ts ──→ Grammy, telegram-bridge.ts

    debate-engine.ts ──→ ai-client.ts
    convergence-detector.ts ──→ NLP (simple heuristics)

    license.ts ──→ Cloudflare KV
    anti-cdp.ts ──→ [user-agent parsing]
    anti-chat-watcher.ts ──→ session-store.ts
```

---

## Database Schema Relationships

```
projects
    ├─ sessions (1:N via projectSlug)
    ├─ telegramSessionMappings (1:N via projectSlug)
    ├─ channels (1:N via projectSlug)
    └─ sessionTemplates (1:N via projectSlug)

sessions (1:N via sessionId)
    ├─ sessionMessages
    ├─ sessionSummaries
    └─ telegramSessionMappings (1:N via sessionId)

channels (1:N via channelId)
    └─ channelMessages

telegramBots (1:N via chatId)
    └─ telegramSessionMappings
```

---

## Authentication & Security

```
┌─────────────────────────────────────────┐
│  API Request                            │
└─────────────────┬───────────────────────┘
                  │
              Middleware
                  │
         ┌────────▼────────┐
         │  auth.ts        │
         │ • Extract token │
         │ • Timing-safe   │
         │   comparison    │
         │ • Reject if bad │
         └────────┬────────┘
                  │
            ✅ Approved
                  │
         Route handler
```

**Auth Method**: API key (Bearer token) with timing-safe string comparison
**Rate Limiting**: Token bucket per IP address
**Secrets**: Environment variables (.env, not committed)

---

## Deployment Pipeline

```
Developer
    │
    ├─ git push origin main
    │
    ├─ GitHub Actions Triggered (docker-publish.yml)
    │
    ├─ Build Stage 1 (web-builder)
    │   ├─ bun install
    │   ├─ next build (packages/web)
    │   └─ Output: /app/packages/web/.next
    │
    ├─ Build Stage 2 (runtime)
    │   ├─ Copy built artifacts
    │   ├─ Install Node + Claude CLI
    │   ├─ Setup Bun runtime
    │   └─ Expose port 3579, 3580
    │
    ├─ Push to ghcr.io (GitHub Container Registry)
    │   ├─ Tag: main, latest, v*.*.*, commit-sha
    │   └─ Metadata: labels, buildtime
    │
    └─ Production Deploy (Docker Compose)
        ├─ docker compose up --build -d
        ├─ Mounts: SQLite, credentials, host drives
        ├─ Health check: /api/health
        └─ Ready at localhost:3579, 3580
```

---

## Runtime Architecture

```
┌────────────────────────────────────┐
│  Docker Container (oven/bun:1.3)   │
├────────────────────────────────────┤
│                                    │
│  Node.js (for Claude CLI)          │
│    ├─ @anthropic-ai/claude-code   │
│    └─ npm globals                  │
│                                    │
│  Bun Runtime                       │
│    ├─ src/index.ts ──→ Hono       │
│    ├─ services/ ──→ Business logic │
│    └─ db/ ──→ Drizzle ORM          │
│                                    │
│  Next.js (packages/web)            │
│    ├─ .next/standalone             │
│    ├─ next start --port 3580       │
│    └─ API routes via Hono          │
│                                    │
│  SQLite Database                   │
│    └─ /app/data/companion.db       │
│                                    │
│  Volume Mounts                     │
│    ├─ companion-data/ (persistence)│
│    ├─ ~/.claude (credentials)      │
│    └─ /mnt/c, /mnt/d (host FS)     │
│                                    │
└────────────────────────────────────┘
```

---

## Type Safety Architecture

```
Shared Types (@companion/shared)
    ├─ types/api.ts (Request/Response)
    ├─ types/session.ts (Session enums)
    ├─ types/telegram.ts (Telegram types)
    └─ constants.ts (APP_VERSION, DEFAULT_PORT)

Server (TypeScript strict)
    ├─ uses @companion/shared/types
    ├─ Zod validation on input
    ├─ SQLite schema via Drizzle
    └─ All functions typed

Web (TypeScript strict)
    ├─ uses @companion/shared/types
    ├─ Component props typed
    ├─ Zustand store typed
    └─ API responses type-checked
```

---

## Key Design Patterns

### Service Layer Pattern
```
Routes → Services → Database
↑           ↑          ↑
API         Business   ORM
endpoints   logic      (Drizzle)
```

### Repository Pattern
```
session-store.ts provides:
  ├─ create(data) → INSERT
  ├─ read(id) → SELECT
  ├─ update(id, data) → UPDATE
  ├─ delete(id) → DELETE
  └─ findByStatus(status) → filtered queries
```

### Observer Pattern (WebSocket)
```
ws-bridge.ts:
  ├─ subscribe(sessionId, callback)
  ├─ broadcast(sessionId, message)
  └─ unsubscribe(sessionId)
```

### Factory Pattern (Telegram)
```
bot-factory.ts:
  └─ createBot(token, handlers) → Grammy bot instance

bot-registry.ts:
  ├─ register(bot)
  ├─ getBot(botId)
  └─ getAll() → all bots
```

### State Machine (Sessions)
```
Session status lifecycle:
  starting → active → ended
    └─ paused (future)
```

---

## Error Handling Strategy

```
Try-Catch Flow:
    ├─ Catch specific exceptions
    ├─ Log with context (logger.ts)
    ├─ Return user-friendly error
    └─ HTTP 400 (user error) or 500 (server error)

Critical Paths:
    ├─ cli-launcher.ts: Subprocess recovery
    ├─ ws-bridge.ts: Reconnection logic
    ├─ ai-client.ts: Stream error handling
    └─ telegram-bridge.ts: Message delivery retry
```

---

## Performance Optimizations

1. **Database**
   - Indexes on hot columns (status, projectSlug, chatId)
   - Query optimization (Drizzle typed queries)

2. **API**
   - Rate limiting (token bucket)
   - Request validation (Zod)
   - Compression (Hono built-in)

3. **Frontend**
   - Zustand (minimal re-renders)
   - Code splitting (Next.js automatic)
   - Image optimization (Next.js Image)
   - Lazy loading (React.lazy)

4. **Streaming**
   - Claude API streaming (real-time updates)
   - WebSocket broadcasting (efficient messaging)
   - Message chunking (Telegram size limits)

---

## Scalability Considerations

**Current Limits**
- SQLite single-file (suitable for <1000 sessions)
- Single Hono server instance
- In-memory WebSocket subscriptions

**Future Improvements**
- PostgreSQL for multi-instance
- Redis for session cache + pub/sub
- Horizontal scaling (load balancer)
- Message queue (async job processing)

---

**Last Updated**: 2026-03-22
