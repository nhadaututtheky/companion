# Companion Project — Complete Codebase Scan

**Project Type**: Monorepo (TypeScript, Bun runtime)
**Date Scanned**: 2026-03-22
**Total Server Code**: ~8,636 lines (services only)

---

## 1. Project Structure

Root directories:
- `packages/shared/` — Shared types & constants
- `packages/server/` — Backend (Bun + Hono + SQLite)
- `packages/web/` — Frontend (Next.js 16 + React 19)
- `.github/workflows/` — CI/CD (Docker publish, Landing page)
- `.rune/` — Planning docs (80+ files, phase-based)
- `landing/` — Static landing page (Cloudflare Pages)
- `data/` — SQLite database + license cache

### Server Directory Structure

```
packages/server/src/
├── index.ts                    # Main entry point (Hono server startup)
├── logger.ts                   # Logging utility
├── test-utils.ts               # Test helpers
│
├── db/
│   ├── client.ts               # SQLite connection pool
│   ├── migrate.ts              # Migration runner
│   ├── schema.ts               # Drizzle ORM schema (13 tables)
│   └── migrations/             # SQL migration files (0000-0003)
│
├── routes/                     # Hono API endpoints
│   ├── index.ts                # Route aggregator
│   ├── channels.ts             # Debate/collab channels
│   ├── filesystem.ts           # File browser + tree
│   ├── health.ts               # Health check
│   ├── projects.ts             # Project CRUD
│   ├── sessions.ts             # Session CRUD + state
│   ├── settings.ts             # App settings (key-value)
│   ├── telegram.ts             # Telegram webhook
│   └── templates.ts            # Session template CRUD
│
├── middleware/
│   ├── auth.ts                 # API key verification (timing-safe)
│   └── rate-limiter.ts         # Token bucket limiter
│
├── services/                   # Core business logic (~8.6k LOC)
│   ├── ai-client.ts            # Claude API streaming wrapper
│   ├── cli-launcher.ts         # Claude Code CLI spawner (DANGER ZONE)
│   ├── sdk-engine.ts           # Claude Agent SDK wrapper
│   ├── ws-bridge.ts            # WebSocket session bridge (CRITICAL)
│   ├── channel-manager.ts       # Channel/debate orchestration
│   ├── debate-engine.ts        # Multi-agent debate logic
│   ├── session-store.ts        # Session CRUD + lifecycle
│   ├── session-summarizer.ts   # Auto-summary on end
│   ├── convergence-detector.ts # Debate convergence detection
│   ├── license.ts              # License verification + trial (TRUST-CRITICAL)
│   ├── project-profiles.ts     # Project config + defaults
│   ├── templates.ts            # Template CRUD + seeding
│   ├── settings-helpers.ts     # Global settings utilities
│   ├── anti-cdp.ts             # Cursor/Codeium blocker
│   ├── anti-chat-watcher.ts    # Idle timeout manager
│   ├── anti-task-watcher.ts    # Task completion monitor
│   │
│   ├── anti-task-watcher.test.ts
│   ├── session-store.test.ts
│   ├── settings-helpers.test.ts
│   └── templates.test.ts
│
├── telegram/                   # Telegram bot integration
│   ├── bot-registry.ts         # Multi-bot manager
│   ├── bot-factory.ts          # Grammy bot creation
│   ├── telegram-bridge.ts      # Bridge Telegram → Sessions
│   ├── stream-handler.ts       # Stream forwarding to Telegram
│   ├── formatter.ts            # Message formatting
│   └── commands/               # 8 command handlers
│       ├── anti.ts             # Anti-CDP commands
│       ├── config.ts           # Config commands
│       ├── control.ts          # Debate/control commands
│       ├── info.ts             # Info commands
│       ├── panel.ts            # Settings panel
│       ├── session.ts          # Session commands
│       ├── template.ts         # Template commands
│       └── utility.ts          # Utility commands
│
└── mcp/                        # Model Context Protocol server
    ├── index.ts                # MCP server startup
    ├── server.ts               # MCP server impl (stdio)
    ├── tools.ts                # Tool definitions
    └── README.md
```

### Web Directory Structure

```
packages/web/src/
├── app/                        # Next.js app router
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   ├── projects/page.tsx       # Projects list
│   ├── sessions/
│   │   ├── page.tsx            # Sessions grid
│   │   └── [id]/page.tsx       # Session detail
│   ├── settings/page.tsx       # Settings page
│   ├── templates/page.tsx      # Templates page
│   ├── globals.css             # Global styles (Tailwind)
│   └── .next/                  # Build output
│
├── components/
│   ├── layout/                 # Layout components
│   ├── session/                # Session UI (15+ components)
│   ├── ring/                   # Magic Ring circular UI
│   ├── grid/                   # Session grid
│   ├── settings/               # Settings panels
│   ├── chat/                   # Chat message display
│   ├── activity/               # Activity feed
│   ├── dashboard/              # Dashboard stats
│   └── shared/                 # Shared components
│
├── lib/
│   ├── api-client.ts           # API wrapper (fetch)
│   ├── animation.ts            # Animation utilities
│   └── stores/                 # Zustand stores (5 total)
│       ├── session-store.ts
│       ├── ui-store.ts
│       ├── ring-store.ts
│       ├── activity-store.ts
│       └── composer-store.ts
│
└── hooks/
    ├── use-session.ts          # Session data fetching
    ├── use-websocket.ts        # WebSocket connection
    └── use-voice-input.ts      # Voice input handler
```

---

## 2. Tech Stack Summary

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Runtime** | Bun | 1.3 | JS runtime + package manager |
| **Server Framework** | Hono | 4.12.8 | Lightweight HTTP server |
| **ORM** | Drizzle | 0.39.3 | Type-safe database layer |
| **Database** | SQLite | (embedded) | File-based relational DB |
| **Bot Framework** | Grammy | 1.41.1 | Telegram bot SDK |
| **AI SDK** | @anthropic-ai/claude-agent-sdk | 0.2.81 | Claude Code integration |
| **MCP** | @modelcontextprotocol/sdk | 1.27.1 | Protocol for AI tools |
| **Frontend** | Next.js | 16 | React framework (SSR) |
| **React** | React | 19 | UI library |
| **Styling** | TailwindCSS | 4 | Utility-first CSS |
| **Icons** | @phosphor-icons/react | 2.1.10 | Icon library |
| **State** | Zustand | 5.0.12 | Minimal state management |
| **Validation** | Zod | 3.24.2 | Schema validation |
| **Linting** | ESLint | 10.0.3 | Code quality checking |
| **Formatter** | Prettier | 3.8.1 | Code formatting |
| **TypeScript** | TypeScript | 5.8.2 | Type safety |
| **Build** | Docker | Multi-stage | Production containerization |
| **Orchestration** | Docker Compose | 3.8 | Local development |
| **CI/CD** | GitHub Actions | - | Automated Docker builds |

---

## 3. Database Schema (13 Tables)

### Core Tables

**projects**
- slug (PK), name, dir, defaultModel, permissionMode, envVars, createdAt, updatedAt

**sessions**
- id (PK), projectSlug (FK), model, status, cwd, pid, permissionMode
- Metrics: totalCostUsd, numTurns, totalInputTokens, totalOutputTokens, cacheTokens
- File tracking: filesRead[], filesModified[], filesCreated[]
- Relationships: parentId (fork), channelId (debate/collab), cliSessionId
- Timestamps: startedAt, endedAt

**sessionMessages**
- id (PK), sessionId (FK), role (user|assistant|system), content, source, sourceId, timestamp

**sessionSummaries**
- id (PK), sessionId (FK), summary, keyDecisions[], filesModified[], createdAt

### Telegram Tables

**telegramBots**
- id (PK), label, role (claude|anti|general), botToken, allowedChatIds[], allowedUserIds[], enabled, notificationGroupId

**telegramSessionMappings**
- chatId (PK), sessionId (FK), projectSlug, model, topicId, pinnedMessageId
- idleTimeoutEnabled, idleTimeoutMs, cliSessionId, createdAt, lastActivityAt

### Debate/Collaboration

**channels**
- id (PK), projectSlug (FK), type (debate|review|red_team|brainstorm), topic
- format, status (active|concluding|concluded), maxRounds, currentRound, verdict
- createdAt, concludedAt

**channelMessages**
- id (PK), channelId (FK), agentId, role (advocate|challenger|judge), content, round, timestamp

### Settings & Templates

**settings**
- key (PK), value, updatedAt

**sessionTemplates**
- id (PK), name, slug (unique), projectSlug (FK), prompt, model, permissionMode, icon, sortOrder

### Analytics

**dailyCosts**
- id (PK), date (YYYY-MM-DD), projectSlug, totalCostUsd, totalSessions, totalTokens

### Indexes (for performance)
- sessions(status, projectSlug)
- sessionMessages(sessionId)
- channels(projectSlug)
- telegramSessionMappings(chatId)

---

## 4. API Routes (Hono endpoints)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | Health check + version info |
| `/api/sessions` | GET | List sessions with filtering |
| `/api/sessions` | POST | Create new session |
| `/api/sessions/:id` | GET | Get session detail + metrics |
| `/api/sessions/:id` | DELETE | End session + archive |
| `/api/sessions/:id/messages` | GET | Get paginated messages |
| `/api/sessions/:id/resume` | POST | Resume ended session |
| `/api/projects` | GET | List projects |
| `/api/projects` | POST | Create project |
| `/api/filesystem/browse` | POST | File browser (recursive) |
| `/api/filesystem/read` | POST | Read file content |
| `/api/filesystem/tree` | POST | File tree with metadata |
| `/api/settings` | GET | Get all settings |
| `/api/settings/:key` | POST | Set key-value setting |
| `/api/templates` | GET | List templates |
| `/api/templates` | POST | Create template |
| `/api/templates/:id` | DELETE | Delete template |
| `/api/channels` | GET | List channels |
| `/api/channels` | POST | Create debate channel |
| `/api/channels/:id/messages` | GET | Get debate messages |
| `/api/telegram/webhook` | POST | Telegram webhook (Grammy) |

---

## 5. Core Services (Business Logic)

### ai-client.ts
- Claude API streaming wrapper
- Supports gpt-4o, claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
- Streaming with token counting
- Request/response logging

### cli-launcher.ts (SECURITY-CRITICAL)
- Spawns Claude Code CLI as child process
- Parses NDJSON streaming responses
- Handles interactive mode (tool use loop)
- Validates command-line arguments
- Manages subprocess lifecycle + error recovery

### sdk-engine.ts
- @anthropic-ai/claude-agent-sdk wrapper
- Replaces CLI spawner for better integration
- Auto-file-discovery, context management
- Error handling + recovery

### ws-bridge.ts (CRITICAL)
- WebSocket message routing (session → clients)
- Broadcast to multiple subscribers
- Session state synchronization
- Message buffering + delivery guarantees

### debate-engine.ts
- Multi-agent debate orchestration
- Supports: advocate, challenger, judge, reviewer roles
- Round-based discussion + convergence detection
- Verdict synthesis from agent positions

### session-store.ts
- Session CRUD + lifecycle management (starting → active → ended)
- Cost aggregation + token tracking
- Idle timeout management
- Session archival on end

### license.ts (TRUST-CRITICAL)
- License key verification (Cloudflare KV backend)
- Free trial activation (7 days)
- Tier enforcement (free=1 session, pro=∞, enterprise)
- License expiration + renewal

### Telegram Services

**bot-registry.ts**
- Multi-bot manager (support 3+ bots simultaneously)
- Bot creation, registration, lifecycle

**telegram-bridge.ts**
- Maps Telegram chats ↔ Claude sessions
- Manages session resumption + idle timeouts
- Forwards messages between platforms

**stream-handler.ts**
- Forwards Claude streaming responses to Telegram
- Chunks long messages, respects Telegram size limits
- Updates message on completion

**commands/** (8 handlers)
- /session — Create, resume, list sessions
- /config — Configure session defaults
- /anti — Anti-CDP settings (Cursor/Codeium block)
- /control — Debate control (start, end, vote)
- /info — Info about session, user, stats
- /panel — Settings UI via Telegram inline keyboard
- /template — Template CRUD via chat
- /utility — Misc utilities (help, usage, etc)

### Additional Services

**channel-manager.ts** — Channel lifecycle, topic routing
**convergence-detector.ts** — Debate convergence analysis
**session-summarizer.ts** — Auto-summary on session end
**project-profiles.ts** — Project defaults + env vars
**templates.ts** — Template CRUD + default seeding
**settings-helpers.ts** — Global settings utilities
**anti-cdp.ts** — Detect + block Cursor/Codeium
**anti-chat-watcher.ts** — Monitor idle timeouts
**anti-task-watcher.ts** — Monitor task completion

---

## 6. Frontend Pages & Components

### Pages (Next.js App Router)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `page.tsx` | Dashboard (stats + recent sessions) |
| `/projects` | `projects/page.tsx` | Project browser + browser |
| `/sessions` | `sessions/page.tsx` | Session grid view (search, filter) |
| `/sessions/[id]` | `sessions/[id]/page.tsx` | Session detail + chat UI |
| `/settings` | `settings/page.tsx` | Telegram bot + app settings |
| `/templates` | `templates/page.tsx` | Session templates CRUD |

### Key Components

**Layout**
- `header.tsx` — Top nav + logo + theme toggle
- `command-palette.tsx` — Cmd+K search (Cmdk)
- `three-column.tsx` — Sidebar + main + right panel layout

**Session UI**
- `message-feed.tsx` — Chat history with markdown
- `message-composer.tsx` — Input + file upload
- `file-viewer.tsx` — Code/text preview
- `file-tree.tsx` — Recursive file browser
- `directory-browser.tsx` — Directory navigation
- `context-meter.tsx` — Token usage indicator
- `session-details.tsx` — Metadata + metrics
- `quick-actions.tsx` — Template shortcuts
- `permission-gate.tsx` — Permission check wrapper

**Magic Ring UI** (Debate/Collab)
- `magic-ring.tsx` — Main ring component
- `ring-window.tsx` — Individual window (draggable)
- `ring-selector.tsx` — Window selector/switcher
- `fan-layout.ts` — Circular geometry calculation

**Grid View**
- `session-grid.tsx` — Masonry grid
- `session-header.tsx` — Session card header
- `compact-message.tsx` — Compact message preview
- `expanded-session.tsx` — Expanded session detail
- `mini-terminal.tsx` — Inline terminal preview

**Settings**
- `telegram-bot-card.tsx` — Bot registration
- `telegram-anti-settings.tsx` — Anti-CDP settings
- `telegram-preview.tsx` — Bot preview
- `telegram-status.tsx` — Connection status
- `telegram-streaming.tsx` — Stream settings

---

## 7. Client-Side State Management (Zustand)

| Store | Purpose | Key State |
|-------|---------|-----------|
| **session-store.ts** | Active session | messages[], status, cost, tokens |
| **ui-store.ts** | UI state | theme, sidebar visible, modals |
| **ring-store.ts** | Ring UI | selected window, animation state |
| **activity-store.ts** | Activity log | logs[], filter, pagination |
| **composer-store.ts** | Message input | draft, attachments[], isLoading |

---

## 8. Database Migrations

| File | Year | Changes |
|------|------|---------|
| `0000_uneven_hulk.sql` | Initial | All 13 tables + primary keys |
| `0001_add_indexes.sql` | Optimization | Add indexes on hot columns |
| `0002_session_templates.sql` | Feature | Add sessionTemplates + sessionSummaries |
| `0003_add_allowed_user_ids.sql` | Security | Add allowedUserIds[] to telegramBots |

---

## 9. Build & Deployment

### Build Commands

```bash
# Root workspace
bun run build              # Build all packages
bun run dev:server         # Start server (hot reload via --hot)
bun run dev:web            # Start web (Next.js dev)
bun run check              # TypeScript check
bun run lint               # ESLint check
bun run lint:fix           # Auto-fix linting
bun run format             # Prettier format

# Server-specific
bun run --filter '@companion/server' db:generate  # Generate migration
bun run --filter '@companion/server' db:migrate   # Run migration
bun run --filter '@companion/server' db:studio    # Drizzle Studio UI
bun run --filter '@companion/server' test         # Run tests
```

### Docker

**Dockerfile (multi-stage)**
1. Stage 1: web-builder — Install deps, build Next.js
2. Stage 2: runtime — Copy built artifacts, install Node + Claude CLI

**Image**: ghcr.io/repository-owner/companion
**Tags**: latest, main, v*.*.*, commit-sha (auto-tagged)

### Docker Compose

```yaml
services:
  companion:
    build: .
    ports:
      - 3579:3579  # API
      - 3580:3580  # Web UI
    volumes:
      - companion-data:/app/data  # SQLite persistence
      - ~/.claude:/root/.claude   # Claude CLI credentials
      - C:/ → /mnt/c              # Windows drive mount
      - D:/ → /mnt/d
    environment:
      - PORT=3579
      - NODE_ENV=production
      - API_KEY=***
      - COMPANION_LICENSE_KEY=***
      - TELEGRAM_BOT_TOKEN=***
```

### GitHub Actions

**docker-publish.yml**
- Trigger: push to main, push tags (v*)
- Build: Docker Buildx multi-platform
- Push: ghcr.io (GitHub Container Registry)
- Tags: branch, semver, sha, latest

**landing-page.yml**
- Deploy landing page to Cloudflare Pages

---

## 10. Configuration Files

| File | Purpose |
|------|---------|
| `.env.example` | Environment template (PORT, API_KEY, LICENSE, TELEGRAM_*) |
| `.env` | Actual secrets (gitignored) |
| `eslint.config.js` | ESLint rules (@eslint/js, React, Next.js, TS) |
| `.prettierrc` | Prettier formatter config |
| `tsconfig.json` (root) | Shared TypeScript config (strict: true) |
| `packages/server/tsconfig.json` | Server-specific TS config |
| `packages/web/tsconfig.json` | Web-specific TS config |
| `packages/server/drizzle.config.ts` | Drizzle ORM + migration config |
| `packages/web/next.config.ts` | Next.js config (logging) |
| `packages/web/postcss.config.mjs` | PostCSS + Tailwind config |
| `docker-compose.yml` | Local dev orchestration |
| `Dockerfile` | Production build |
| `bun.lock` | Dependency lock (Bun format) |

---

## 11. Shared Types & Constants

**@companion/shared/src/**

- `constants.ts` — APP_VERSION, DEFAULT_PORT, MODEL_IDS
- `types/api.ts` — API request/response shapes
- `types/session.ts` — Session type enums + interfaces
- `types/telegram.ts` — Telegram-specific types
- `index.ts` — Main export (types + constants)

---

## 12. Key Entry Points

| Component | File | Function |
|-----------|------|----------|
| **Server** | `packages/server/src/index.ts` | Startup: DB init, migrations, license check, Hono app creation, middleware setup |
| **Web** | `packages/web/src/app/layout.tsx` | Root layout (Toaster, theme script, CommandPalette) |
| **Telegram** | `packages/server/src/telegram/bot-registry.ts` | Multi-bot registration + Grammy setup |
| **MCP** | `packages/server/src/mcp/index.ts` | MCP server init (stdio transport) |

---

## 13. Test Suite

**4 test files** (server/src/services/):

```
├── anti-task-watcher.test.ts       # Task monitoring
├── session-store.test.ts            # Session CRUD + lifecycle
├── settings-helpers.test.ts         # Settings utilities
└── templates.test.ts                # Template CRUD
```

**Framework**: Bun test (built-in)
**Coverage**: <5% (mostly critical paths)
**Status**: ⚠️ Needs expansion

---

## 14. Project Health Metrics

| Metric | Status | Notes |
|--------|--------|-------|
| **Tests** | ⚠️ LOW | 4 test files, <5% coverage |
| **Linting** | ✅ CONFIGURED | ESLint v10, no violations |
| **Type Safety** | ✅ STRICT | TypeScript strict mode, Zod validation |
| **Documentation** | ⚠️ INCOMPLETE | Some services undocumented |
| **Error Handling** | ✅ GOOD | Try-catch, error logging |
| **Logging** | ✅ GOOD | Structured logging with context |
| **Code Size** | ✅ REASONABLE | Services ~8.6k LOC, modular structure |
| **Build Speed** | ✅ FAST | Bun + Docker layer caching |

---

## 15. Danger Zones (Extra Testing Required)

1. **cli-launcher.ts** — Subprocess spawning (security-critical)
2. **ws-bridge.ts** — Message routing (session sync critical)
3. **license.ts** — License verification (trust-critical)
4. **anti-cdp.ts** — Codeium/Cursor detection (browser-specific)

---

## 16. Deployment Flow

```
Code Push (GitHub)
    ↓ GitHub Actions
Build Docker Image (multi-stage)
    ↓
Push to ghcr.io (GitHub Container Registry)
    ↓
Deploy via Docker Compose
    ├── API Server (port 3579)
    ├── Web UI (port 3580)
    ├── SQLite Database (data/ volume)
    └── Host Mounts (C:/, D:/)
```

---

## 17. Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | 3579 | Server port |
| `NODE_ENV` | No | development | dev/production |
| `API_KEY` | Yes (prod) | - | Request authentication (timing-safe compare) |
| `COMPANION_LICENSE_KEY` | No | - | License verification (Cloudflare KV) |
| `ALLOWED_ORIGINS` | No | localhost | CORS origins |
| `TELEGRAM_BOT_TOKEN` | No | - | Telegram bot token |
| `TELEGRAM_ALLOWED_CHAT_IDS` | No | - | Whitelist chats (comma-separated) |
| `TELEGRAM_ALLOWED_USER_IDS` | No | - | Whitelist users (comma-separated) |
| `DATABASE_PATH` | No | ./data/companion.db | SQLite file path |

---

## 18. File Statistics

- **Total TypeScript files** (src/): 60+
- **Total React components** (web/): 30+
- **Total services** (server/): 25+
- **API routes**: 20+
- **Database tables**: 13
- **Telegram commands**: 8
- **Test files**: 4
- **Config files**: 10+
- **Migrations**: 4
- **Total lines** (services): ~8,636

