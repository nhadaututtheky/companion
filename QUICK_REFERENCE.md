# Companion — Quick Reference Guide

## Project at a Glance

- **Type**: Autonomous Agent Platform (Claude Code + Claude Agent SDK)
- **Architecture**: Bun monorepo (3 packages: server, web, shared)
- **Database**: SQLite + Drizzle ORM (13 tables)
- **Deployment**: Docker + GitHub Actions (ghcr.io)

---

## 📁 Directory Map

### Must-Know Paths

**Server Entry Point**
```
packages/server/src/index.ts         # Startup, DB init, license check
```

**Web Entry Point**
```
packages/web/src/app/layout.tsx      # Root layout, Toaster, theme
packages/web/src/app/page.tsx        # Dashboard home
```

**Database**
```
packages/server/src/db/schema.ts     # 13 tables (Drizzle ORM)
packages/server/src/db/migrations/   # SQL migrations (4 versions)
```

**API Routes**
```
packages/server/src/routes/          # 20 endpoints (Hono framework)
```

**Core Services** (8.6k LOC)
```
packages/server/src/services/        # 25 business logic modules
  - ai-client.ts       (Claude API wrapper)
  - cli-launcher.ts    (Claude Code spawner) ⚠️ DANGER ZONE
  - sdk-engine.ts      (Agent SDK wrapper)
  - ws-bridge.ts       (WebSocket routing) 🔴 CRITICAL
  - debate-engine.ts   (Multi-agent logic)
  - license.ts         (License verification) ⚠️ TRUST-CRITICAL
  - session-store.ts   (Session lifecycle)
  - telegram/*         (8 command handlers)
```

**Frontend Components**
```
packages/web/src/components/         # 30+ React components
  - session/           (Chat, file viewer, composer)
  - ring/              (Circular Magic Ring UI)
  - grid/              (Masonry grid layout)
  - settings/          (Telegram bot config)
  - layout/            (Header, command palette)
```

**State Management**
```
packages/web/src/lib/stores/         # 5 Zustand stores
  - session-store.ts   (Messages, cost, status)
  - ui-store.ts        (Theme, sidebar)
  - ring-store.ts      (Ring animation)
```

---

## 🗄️ Database Tables (Quick Ref)

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| **projects** | Project configs | slug, name, dir, defaultModel |
| **sessions** | Claude sessions | id, status, cwd, cost, tokens |
| **sessionMessages** | Chat history | sessionId, role, content, timestamp |
| **telegramBots** | Bot registration | botToken, allowedChatIds, role |
| **telegramSessionMappings** | Chat↔Session mapping | chatId, sessionId, idleTimeoutMs |
| **channels** | Debates/collab | type, topic, status, round |
| **channelMessages** | Debate messages | channelId, agentId, role, content |
| **sessionTemplates** | Reusable prompts | name, slug, prompt, icon |
| **sessionSummaries** | Auto-summaries | summary, keyDecisions, filesModified |
| **settings** | Key-value store | key, value |
| **dailyCosts** | Cost analytics | date, totalCostUsd, totalTokens |

---

## 🔌 API Endpoints (20 total)

**Sessions**
- `GET /api/sessions` — List all
- `POST /api/sessions` — Create new
- `GET /api/sessions/:id` — Get detail
- `DELETE /api/sessions/:id` — End session
- `GET /api/sessions/:id/messages` — Get messages
- `POST /api/sessions/:id/resume` — Resume session

**File System**
- `POST /api/filesystem/browse` — File browser
- `POST /api/filesystem/read` — Read file
- `POST /api/filesystem/tree` — Tree view

**Projects, Templates, Channels, Telegram, Settings**
- See CODEBASE_SCAN.md section 4 for full list

---

## 🏗️ Tech Stack (Key Tools)

| Layer | Tech | Version |
|-------|------|---------|
| Runtime | Bun | 1.3 |
| Server | Hono | 4.12 |
| Database | Drizzle | 0.39 |
| Bot | Grammy | 1.41 |
| Frontend | Next.js | 16 |
| React | React | 19 |
| CSS | TailwindCSS | 4 |
| State | Zustand | 5.0 |

---

## 🚀 Common Commands

```bash
# Development
bun run dev:server             # Start server (hot reload)
bun run dev:web                # Start web UI
bun run check                  # Type check

# Database
bun run db:generate            # Create migration
bun run db:migrate             # Run migration
bun run db:studio              # Drizzle Studio UI

# Build & Deploy
bun run build                  # Build all packages
docker compose up --build      # Docker local dev
docker compose up -d           # Docker production

# Code Quality
bun run lint                   # ESLint check
bun run format                 # Prettier format
```

---

## 📋 Page Routes (Frontend)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Dashboard |
| `/projects` | `app/projects/page.tsx` | Project browser |
| `/sessions` | `app/sessions/page.tsx` | Session grid |
| `/sessions/[id]` | `app/sessions/[id]/page.tsx` | Chat + detail |
| `/settings` | `app/settings/page.tsx` | Telegram config |
| `/templates` | `app/templates/page.tsx` | Template CRUD |

---

## 🔐 Danger Zones (Need Extra Testing)

1. **cli-launcher.ts** — Spawns Claude Code process
   - Security: Validates args, handles subprocess errors
   - Critical: Process lifecycle, NDJSON parsing

2. **ws-bridge.ts** — WebSocket message routing
   - Critical: Session sync, broadcast to clients

3. **license.ts** — License verification
   - Trust: Cloudflare KV integration, trial logic

4. **anti-cdp.ts** — Detects Cursor/Codeium
   - Browser-specific: User-agent parsing

---

## 🧪 Testing (Status: ⚠️ LOW)

**Test Files** (4 total)
```
packages/server/src/services/
├── anti-task-watcher.test.ts
├── session-store.test.ts
├── settings-helpers.test.ts
└── templates.test.ts
```

**Coverage**: <5% — critical services lack tests
**Framework**: Bun test (built-in)

---

## 📊 Project Health

| Check | Status | Notes |
|-------|--------|-------|
| Linting | ✅ | ESLint configured |
| Type Safety | ✅ | TS strict mode |
| Tests | ⚠️ | <5% coverage |
| Docs | ⚠️ | Some services missing docs |
| Logging | ✅ | Structured logging |
| Error Handling | ✅ | Good try-catch coverage |

---

## 🌍 Environment Variables

**Required in Production**
- `API_KEY` — Timing-safe request auth

**Optional (with Defaults)**
- `PORT` (3579)
- `NODE_ENV` (development)
- `COMPANION_LICENSE_KEY` — For license verification
- `TELEGRAM_BOT_TOKEN` — Telegram bot setup
- `TELEGRAM_ALLOWED_CHAT_IDS` — Chat whitelist
- `TELEGRAM_ALLOWED_USER_IDS` — User whitelist
- `DATABASE_PATH` (./data/companion.db)

---

## 🐳 Docker Deployment

**Build & Run**
```bash
docker compose up --build -d
```

**Access**
- API: `http://localhost:3579/api/*`
- Web UI: `http://localhost:3580`
- Health: `http://localhost:3579/api/health`

**Volumes**
- `companion-data` → SQLite persistence
- `~/.claude` → Claude CLI credentials
- `C:/, D:/` → Host filesystem access

---

## 🔄 CI/CD Pipeline

**GitHub Actions** → Docker Push
1. Push to `main` or tag `v*`
2. GitHub Actions triggers `docker-publish.yml`
3. Build multi-stage Docker image
4. Push to `ghcr.io/owner/companion`
5. Tags: `main`, `v*.*.* `, `sha`, `latest`

---

## 📝 Shared Types Location

All types in `@companion/shared/src/types/`:
- `api.ts` — API request/response shapes
- `session.ts` — Session enums + interfaces
- `telegram.ts` — Telegram-specific types

---

## 🎯 Key Features

- **Multi-Session Management** — Run multiple Claude sessions
- **Telegram Integration** — Control sessions via Telegram
- **Multi-Agent Debates** — Advocate, Challenger, Judge roles
- **Idle Timeout** — Auto-end sessions after inactivity
- **License Tiering** — Free (1), Pro (∞), Enterprise
- **File Browsing** — Browser-based file explorer
- **Session Templates** — Reusable prompts
- **Auto-Summaries** — Summarize sessions on end
- **Magic Ring UI** — Circular window for debates
- **Cost Analytics** — Track usage + spending

---

## 🔗 External Services

- **Claude API** — Chat completions, streaming
- **Cloudflare KV** — License key storage
- **Telegram Bot API** — Via Grammy
- **GitHub Container Registry** — Docker image hosting
- **Cloudflare Pages** — Landing page hosting (landing/)

---

## 📚 Documentation Files

- `CODEBASE_SCAN.md` — Complete codebase analysis
- `QUICK_REFERENCE.md` — This file
- `AUDIT-REPORT.md` — Project audit findings
- `.rune/plan-*.md` — Phase-based implementation plans (80+ docs)
- `.claude/CLAUDE.md` — Project instructions

---

**Last Updated**: 2026-03-22
**Scan Version**: 1.0
**Language**: TypeScript (server + web)
**Package Manager**: Bun
