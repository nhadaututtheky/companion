# Companion Architecture Brainstorm

> Comprehensive analysis for extracting Companion from MyTrend into a standalone product.
> Author: Architect Agent (Opus) | Date: 2026-03-17

---

## 1. Vision & Product Identity

### What Companion Is
A **local-first AI agent control plane** for developers who use Claude Code. It sits between the human and the CLI, providing:

- **Remote control** via Telegram (mobile-first workflow)
- **Visual monitoring** via web dashboard (real-time session state)
- **Session management** (launch, resume, fork, stop CLI processes)
- **Permission gating** (approve/deny tool use from phone or browser)
- **Cost & usage analytics** (token tracking, cost per project)
- **Browser automation** via CDP (AntiGravity)

### Target Audience
Solo developers and small teams who:
1. Run Claude Code sessions that take 5-30+ minutes
2. Want to monitor/control sessions from their phone while AFK
3. Manage multiple projects and want cost visibility
4. Need permission approval without sitting at the terminal

### Unique Value Proposition
**"Claude Code's mission control."** Unlike Cursor/Windsurf (which replace the IDE), Companion enhances Claude Code without replacing it. It adds:
- Mobile control layer (Telegram) -- no other tool does this
- Multi-session visibility across projects
- Cost tracking that Claude Code itself does not provide persistently
- Permission management from any device
- Session history and analytics

### Product Name Options
Keep "Companion" -- it accurately describes the relationship to Claude Code. Alternative: "Beacon" (signals, monitoring), "Relay" (bridging). Recommendation: **Companion** is clear and memorable.

---

## 2. Tech Stack Decision

### 2A. Frontend Framework

#### Option 1: Next.js 16 (App Router) -- RECOMMENDED
| Aspect | Assessment |
|--------|-----------|
| Pros | User's preferred SaaS stack, shadcn/ui ecosystem, TailwindCSS 4 native, Server Components for initial load, strong TypeScript, huge ecosystem |
| Cons | Heavier than SvelteKit, requires Node/Bun runtime for SSR, React 19 learning curve for concurrent features |
| Fit | Perfect for dashboard-heavy SaaS UI with real-time updates |

#### Option 2: SvelteKit 5 (Keep Current)
| Aspect | Assessment |
|--------|-----------|
| Pros | Already written (copy-paste), lighter bundle, Svelte 5 runes are excellent, less boilerplate |
| Cons | Comic design system must be rewritten anyway (wrong aesthetic), smaller ecosystem for SaaS components, user's CLAUDE.md maps SaaS to Next.js |
| Fit | Good framework but wrong design system -- rewrite effort is similar either way |

#### Option 3: Vite + React 19 (SPA only)
| Aspect | Assessment |
|--------|-----------|
| Pros | Simplest deployment (static files), no SSR complexity, matches user's Trading stack |
| Cons | No SEO (irrelevant for this app), no server components, still need API separately |
| Fit | Viable but loses Next.js API routes convenience |

**Decision: Next.js 16.** The SvelteKit code cannot be copied as-is because the Comic design system is project-specific to MyTrend. Since we rewrite UI anyway, pick the framework that matches the user's SaaS preference and has the richest component ecosystem (shadcn/ui).

### 2B. Database

#### Option 1: SQLite + Drizzle ORM -- RECOMMENDED
| Aspect | Assessment |
|--------|-----------|
| Pros | Local-first (no server), embedded in Bun, Drizzle has excellent DX, type-safe queries, zero ops, fast |
| Cons | No built-in auth/admin UI (build it), no real-time subscriptions (use WS bridge instead), single-writer |
| Fit | Perfect for local-first tool. Companion already uses file-based JSON -- SQLite is a strict upgrade |

#### Option 2: Keep PocketBase
| Aspect | Assessment |
|--------|-----------|
| Pros | Built-in auth, admin UI, real-time subscriptions, file storage, proven in MyTrend |
| Cons | External Go binary dependency, Goja hooks are ES5.1 (painful), adds Docker complexity, overkill for single-user local tool |
| Fit | Overhead not justified when Companion's real-time is already handled by its own WS bridge |

#### Option 3: PostgreSQL + Drizzle
| Aspect | Assessment |
|--------|-----------|
| Pros | Production-grade, supports concurrent writes, excellent tooling |
| Cons | Requires external server, breaks local-first principle, overkill for single-user |
| Fit | Only makes sense if Companion becomes a hosted SaaS (future consideration) |

**Decision: SQLite + Drizzle.** Companion is fundamentally a local tool. SQLite removes the PocketBase dependency, keeps everything in one process, and Drizzle gives us type-safe queries with migration support. The WsBridge already handles all real-time communication.

### 2C. Backend Runtime

#### Option 1: Keep Bun + Hono -- RECOMMENDED
| Aspect | Assessment |
|--------|-----------|
| Pros | Already proven, Bun.serve has native WebSocket, subprocess spawning works, Hono is lightweight, TypeScript-native |
| Cons | Bun still has occasional edge cases, smaller ecosystem than Node |
| Fit | Existing code works well. No reason to change. |

#### Option 2: Node.js + Fastify
| Aspect | Assessment |
|--------|-----------|
| Pros | More mature, larger ecosystem, better debugging tools |
| Cons | No native WebSocket in serve(), needs ws library, subprocess API different, migration effort |
| Fit | Not worth the migration cost |

**Decision: Keep Bun + Hono.** The existing backend code is solid. Bun's native WebSocket support on `Bun.serve` is a key advantage for the bridge architecture. No reason to rewrite what works.

### 2D. Monorepo Strategy

#### Option 1: Bun Workspaces -- RECOMMENDED
| Aspect | Assessment |
|--------|-----------|
| Pros | Native to Bun, zero config, workspace: protocol for cross-package imports, fast installs |
| Cons | No built-in task orchestration (use scripts), less mature than Turborepo |
| Fit | 3 packages is too small for Turborepo overhead |

#### Option 2: Turborepo
| Aspect | Assessment |
|--------|-----------|
| Pros | Task caching, dependency graph, parallel builds, proven at scale |
| Cons | Extra dependency, config overhead, unnecessary for 3 packages |
| Fit | Overkill |

**Decision: Bun workspaces.** Simple, native, zero-config for a 3-package monorepo.

---

## 3. Architecture Design

### 3A. Monorepo Structure

```
companion/
  package.json              # Bun workspace root
  bun.lock
  .env                      # Shared env vars
  .env.example
  docker-compose.yml
  Dockerfile

  packages/
    shared/                 # @companion/shared
      package.json
      src/
        types/
          session.ts        # SessionState, CLIMessage, BrowserMessage types
          telegram.ts       # Telegram types
          api.ts            # API request/response types
        constants.ts        # Shared constants (ports, timeouts)
        utils/
          format.ts         # Number/currency formatting
          cost.ts           # Token cost calculation

    server/                 # @companion/server (Bun + Hono)
      package.json
      src/
        index.ts            # Entry point, Bun.serve with WS
        db/
          schema.ts         # Drizzle schema
          migrations/       # SQL migrations
          client.ts         # DB client singleton
        services/
          session-store.ts  # SQLite-backed session persistence
          cli-launcher.ts   # Claude Code process spawning
          ws-bridge.ts      # WebSocket bridge (CLI <-> Browser <-> Telegram)
          project-profiles.ts
          skill-scanner.ts
        routes/
          index.ts          # Route aggregator
          sessions.ts       # /api/sessions/*
          projects.ts       # /api/projects/*
          telegram.ts       # /api/telegram/*
          health.ts         # /api/health
          antigravity.ts    # /api/antigravity/*
          analytics.ts      # /api/analytics/*
        telegram/
          bot-registry.ts   # Multi-bot management
          telegram-bridge.ts
          telegram-commands.ts
          telegram-formatter.ts
          telegram-api.ts
          telegram-config.ts
          telegram-research.ts
        antigravity/
          cdp-client.ts     # Chrome DevTools Protocol
          chat-watcher.ts
          task-watcher.ts
        middleware/
          auth.ts           # API key auth
          rate-limiter.ts
          cors.ts
        logger.ts

    web/                    # @companion/web (Next.js 16)
      package.json
      next.config.ts
      tailwind.config.ts
      src/
        app/
          layout.tsx        # Root layout (dark mode, fonts)
          page.tsx          # Dashboard
          sessions/
            page.tsx        # Session list
            [id]/
              page.tsx      # Session detail + terminal
          projects/
            page.tsx        # Project list
          analytics/
            page.tsx        # Cost & usage analytics
          settings/
            page.tsx        # Configuration
          telegram/
            page.tsx        # Telegram bot management
        components/
          ui/               # shadcn/ui primitives
          layout/
            sidebar.tsx
            header.tsx
            command-palette.tsx
          session/
            terminal.tsx    # WebSocket terminal
            message-feed.tsx
            permission-gate.tsx
            context-meter.tsx
            session-card.tsx
          dashboard/
            stats-grid.tsx
            cost-chart.tsx
            session-timeline.tsx
            project-cards.tsx
          analytics/
            cost-breakdown.tsx
            usage-heatmap.tsx
            model-distribution.tsx
        hooks/
          use-websocket.ts
          use-session.ts
          use-cost-tracker.ts
        lib/
          api-client.ts    # Fetch wrapper for server API
          ws-client.ts     # WebSocket connection manager
          stores/          # Zustand stores
            session-store.ts
            ui-store.ts
        styles/
          globals.css       # TailwindCSS 4 + custom properties
```

### 3B. Database Schema (Drizzle + SQLite)

```typescript
// packages/server/src/db/schema.ts

// Sessions table -- replaces file-based JSON
sessions: {
  id: text('id').primaryKey(),           // UUID
  project_slug: text('project_slug'),
  model: text('model').notNull(),
  status: text('status').notNull(),       // starting|idle|busy|compacting|ended|error
  cwd: text('cwd').notNull(),
  permission_mode: text('permission_mode').default('default'),
  claude_code_version: text('claude_code_version'),
  total_cost_usd: real('total_cost_usd').default(0),
  num_turns: integer('num_turns').default(0),
  total_input_tokens: integer('total_input_tokens').default(0),
  total_output_tokens: integer('total_output_tokens').default(0),
  cache_creation_tokens: integer('cache_creation_tokens').default(0),
  cache_read_tokens: integer('cache_read_tokens').default(0),
  total_lines_added: integer('total_lines_added').default(0),
  total_lines_removed: integer('total_lines_removed').default(0),
  files_read: text('files_read'),         // JSON array
  files_modified: text('files_modified'), // JSON array
  files_created: text('files_created'),   // JSON array
  mcp_servers: text('mcp_servers'),       // JSON array
  tools: text('tools'),                   // JSON array
  pid: integer('pid'),
  started_at: integer('started_at').notNull(),
  ended_at: integer('ended_at'),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}

// Session messages -- replaces in-memory messageHistory
session_messages: {
  id: integer('id').primaryKey({ autoIncrement: true }),
  session_id: text('session_id').notNull().references(() => sessions.id),
  type: text('type').notNull(),           // user_message|assistant|result|permission_request|...
  content: text('content').notNull(),     // JSON blob of the full message
  timestamp: integer('timestamp').notNull(),
}

// Projects -- replaces ProjectProfileStore
projects: {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  dir: text('dir').notNull(),
  default_model: text('default_model').default('sonnet'),
  permission_mode: text('permission_mode').default('default'),
  env_vars: text('env_vars'),             // JSON object
  total_sessions: integer('total_sessions').default(0),
  total_cost_usd: real('total_cost_usd').default(0),
  total_tokens: integer('total_tokens').default(0),
  last_session_at: integer('last_session_at'),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}

// Telegram config -- replaces JSON config files
telegram_bots: {
  id: text('id').primaryKey(),            // bot1, bot2, etc.
  label: text('label').notNull(),
  role: text('role').notNull(),           // claude|anti|general
  bot_token_encrypted: text('bot_token_encrypted').notNull(),
  allowed_chat_ids: text('allowed_chat_ids').notNull(), // JSON array
  enabled: integer('enabled').default(1),
  created_at: integer('created_at').default(sql`(unixepoch())`),
}

// Cost tracking -- daily aggregates
daily_costs: {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),           // YYYY-MM-DD
  project_slug: text('project_slug'),
  model: text('model').notNull(),
  input_tokens: integer('input_tokens').default(0),
  output_tokens: integer('output_tokens').default(0),
  cache_creation_tokens: integer('cache_creation_tokens').default(0),
  cache_read_tokens: integer('cache_read_tokens').default(0),
  total_cost_usd: real('total_cost_usd').default(0),
  session_count: integer('session_count').default(0),
}

// Settings -- key-value store for app config
settings: {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: integer('updated_at').default(sql`(unixepoch())`),
}
```

### 3C. Real-Time Communication Strategy

The existing WsBridge architecture is excellent and should be kept largely intact:

```
                    +------------------+
                    |  Telegram Bot(s) |
                    |  (long-polling)  |
                    +--------+---------+
                             |
                    subscribe/inject
                             |
+----------+     +----------v-----------+     +-------------+
| Browser  |<--->|      WsBridge        |<--->| Claude Code |
| (WebSocket)    | (in-memory hub)      |     | CLI Process |
+----------+     +----------+-----------+     | (stdin/stdout)
                             |                +-------------+
                    persist to SQLite
                             |
                    +--------v---------+
                    |  SQLite (Drizzle) |
                    +------------------+
```

Key changes from current:
1. **SessionStore** backs to SQLite instead of encrypted JSON files
2. **Message history** stored in `session_messages` table (queryable, not just blobs)
3. **Cost aggregation** computed on session end, stored in `daily_costs`
4. **No PocketBase dependency** -- WsBridge IS the real-time layer

### 3D. Deployment Strategy

#### Development
```bash
bun dev          # Runs server (3457) + next dev (3000) concurrently
```

#### Production (Docker)
```dockerfile
# Single multi-stage Dockerfile
# Stage 1: Build Next.js static export
# Stage 2: Bun runtime with server + static files
# Result: Single container, single port (3457)
#   - /api/* -> Hono routes
#   - /ws/*  -> WebSocket upgrade
#   - /*     -> Next.js static files (served by Hono)
```

This is simpler than MyTrend's 3-container setup (PocketBase + SvelteKit + Nginx). One container, one process, one port.

#### Alternative: Separate Containers
If someone wants to scale the frontend independently:
```yaml
services:
  server:   # Bun + Hono + WS (port 3457)
  web:      # Next.js (port 3000)
  # No database container -- SQLite is embedded
```

**Recommendation: Single container.** Companion is a local tool. One container = simple.

---

## 4. UI/UX Vision

### 4A. Design Language

**Palette B (SaaS/Dashboard) -- Dark Mode First**
```css
--bg-base: #0f172a;      /* Slate 900 */
--bg-card: #1e293b;      /* Slate 800 */
--bg-elevated: #334155;  /* Slate 700 */
--text-primary: #f8fafc; /* Slate 50 */
--text-secondary: #94a3b8; /* Slate 400 */
--primary: #6366f1;      /* Indigo 500 -- NOTE: customize per anti-AI rule */
--success: #10b981;      /* Emerald 500 */
--danger: #ef4444;       /* Red 500 */
--warning: #f59e0b;      /* Amber 500 */
```

Per anti-AI rules, replace default indigo with a custom brand color:
```css
--primary: #06b6d4;      /* Cyan 500 -- fresh, techy, distinct */
--primary-hover: #0891b2; /* Cyan 600 */
```

**Typography**: Space Grotesk (headings) + Inter (body) + JetBrains Mono (terminal/tokens/costs)

**Icons**: Phosphor Icons (not Lucide)

### 4B. Screen Map

```
/                          Dashboard (session overview, cost summary, quick actions)
/sessions                  Session list (active/ended, filterable)
/sessions/[id]             Session detail (terminal, messages, permissions, context meter)
/projects                  Project list with stats
/projects/[slug]           Project detail (sessions history, cost, config)
/analytics                 Cost & usage analytics (charts, breakdowns)
/analytics/costs           Detailed cost tracking per project/model/day
/analytics/usage           Token usage patterns, heatmap
/settings                  App configuration
/settings/telegram         Telegram bot management (multi-bot config)
/settings/projects         Project directory management
/settings/appearance       Theme, layout preferences
```

### 4C. Dashboard Design

The dashboard should answer: "What is happening across all my projects RIGHT NOW?"

```
+-------------------------------------------------------------------+
| COMPANION                                    [Cmd+K] [Settings]   |
+-------------------------------------------------------------------+
|                                                                   |
|  +--Active Sessions (live)-------------------------------------+  |
|  |                                                             |  |
|  |  [MyTrend] sonnet | idle | $0.42 | 12 turns  [Open]       |  |
|  |  [Companion] opus | busy... | $1.23 | 8 turns  [Open]     |  |
|  |  [FutureBot] haiku | idle | $0.05 | 3 turns  [Open]       |  |
|  |                                                             |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  +--Cost Today--+  +--This Week--+  +--Sessions--+  +--Tokens--+ |
|  |    $3.47     |  |   $18.92    |  |     42     |  |   1.2M   | |
|  |  +12% vs avg |  |  -5% vs avg|  |  8 active  |  | 340K out | |
|  +--------------+  +------------+  +------------+  +----------+ |
|                                                                   |
|  +--Cost by Project (7d)---+  +--Model Distribution (7d)-------+ |
|  |  [bar chart]            |  |  [donut chart]                 | |
|  |  MyTrend:    $8.40      |  |  Sonnet: 68%                  | |
|  |  Companion:  $5.20      |  |  Opus:   22%                  | |
|  |  FutureBot:  $3.10      |  |  Haiku:  10%                  | |
|  +--------------------------+  +-------------------------------+ |
|                                                                   |
|  +--Recent Activity-----------------------------------------+    |
|  |  10:42 [MyTrend] Session ended ($0.42, 12 turns)        |    |
|  |  10:38 [Companion] Permission approved: Bash             |    |
|  |  10:35 [FutureBot] Session started (haiku)               |    |
|  +-----------------------------------------------------------+   |
+-------------------------------------------------------------------+
```

### 4D. Session Terminal (Key Screen)

This is the most important screen. It must feel like a real terminal with superpowers.

```
+-------------------------------------------------------------------+
| < Back    MyTrend / Session abc123        sonnet | idle | $0.42   |
+-------------------------------------------------------------------+
| [Messages] [Files] [Context] [Permissions]                        |
+-------------------------------------------------------------------+
|                                                                   |
|  USER (10:30)                                                     |
|  Fix the login form validation                                    |
|                                                                   |
|  ASSISTANT (10:30)                                                |
|  I'll fix the login form validation. Let me first read the...     |
|                                                                   |
|  [Read] src/components/LoginForm.tsx                              |
|  [Edit] src/components/LoginForm.tsx  +12 -3                      |
|                                                                   |
|  PERMISSION REQUEST                                               |
|  +-------------------------------------------------------+       |
|  | Bash: npm test -- --testPathPattern=login              |       |
|  |                                                        |       |
|  | [Allow]  [Allow Always]  [Deny]       auto in 28s     |       |
|  +-------------------------------------------------------+       |
|                                                                   |
+-------------------------------------------------------------------+
| Context: 72% [=========>    ]  142K/200K tokens                   |
+-------------------------------------------------------------------+
| > Type a message...                               [Send] [Stop]  |
+-------------------------------------------------------------------+
```

Key improvements over current Vibe UI:
1. **Context meter** always visible at bottom
2. **File operations** shown inline (not just text)
3. **Permission requests** are prominent with countdown timer
4. **Cost counter** in header updates live
5. **Streaming text** with proper markdown rendering
6. **Tool progress** indicators (spinner + elapsed time)
7. **Message collapsing** for long tool outputs

### 4E. Differentiation from Cursor/Windsurf

| Feature | Cursor | Windsurf | Companion |
|---------|--------|----------|-----------|
| IDE replacement | Yes | Yes | No (enhances CLI) |
| Mobile control | No | No | Yes (Telegram) |
| Multi-session | No | No | Yes |
| Cost tracking | No | No | Yes |
| Remote permission | No | No | Yes |
| Self-hosted | No | No | Yes |
| Open protocol | No | No | Yes (NDJSON/WS) |

Companion does NOT compete with IDEs. It competes with "looking at your terminal."

---

## 5. New Features to Consider

### 5A. Priority 1 (Phase 5 -- ship with v1)

**Cost Tracking Dashboard**
- Per-project daily/weekly/monthly costs
- Model breakdown (Sonnet vs Opus vs Haiku)
- Cost alerts (daily budget, per-session budget)
- Export to CSV

**Multi-Project Management**
- Project cards with health indicators
- Quick-switch between projects
- Per-project default model/permission config
- Project-level cost budgets

### 5B. Priority 2 (v1.1)

**Session Analytics**
- Session duration distribution
- Turns-per-session histogram
- Files-touched frequency map
- Most-used tools breakdown
- Activity heatmap (GitHub-style)

**MCP Server Management UI**
- List active MCP servers per session
- Server health indicators
- Quick-enable/disable MCP servers
- MCP server logs viewer

### 5C. Priority 3 (v2.0)

**Team Collaboration** (requires auth + multi-user)
- Shared project dashboards
- Session handoff between team members
- Shared permission policies
- Team cost budgets

**Plugin/Extension System**
- Custom Telegram commands via plugins
- Custom dashboard widgets
- Webhook integrations (Slack, Discord)
- Custom MCP server launcher

**Session Replay**
- Full session playback (like a recording)
- Annotate sessions with notes
- Share session recordings (read-only link)

---

## 6. Migration Strategy

### 6A. Code Copy vs Rewrite Matrix

| Module | Action | Reason |
|--------|--------|--------|
| `ws-bridge.ts` | Copy + minor adapt | Core architecture is excellent, just swap SessionStore to Drizzle |
| `session-types.ts` | Copy as-is | Types are clean, move to @companion/shared |
| `cli-launcher.ts` | Copy + minor adapt | Works well, minor API changes |
| `session-store.ts` | Rewrite | Replace file-based JSON with Drizzle/SQLite |
| `telegram/*.ts` | Copy + adapt | Core logic stays, remove PB/MyTrend references |
| `routes.ts` | Rewrite | Split monolith into route modules, remove MyTrend-specific endpoints |
| `logger.ts` | Copy as-is | Simple and effective |
| `rate-limiter.ts` | Copy as-is | Works |
| `auth-middleware.ts` | Copy + adapt | Remove PB dependency |
| `anti-cdp.ts` | Copy as-is | Standalone CDP client |
| `license.ts` | Leave behind | MyTrend-specific licensing |
| `sepay.ts` | Leave behind | MyTrend-specific payments |
| `plans.ts` | Leave behind | MyTrend-specific plan tiers |
| `translate.ts` | Copy as-is | Useful for Vi-En translation |
| Frontend (Vibe) | Rewrite | Different framework, different design system |
| PocketBase hooks | Leave behind | Replaced by Drizzle |

### 6B. What to Leave Behind (MyTrend-specific)

1. **License/payment system** (SePay, license keys, plan tiers)
2. **PocketBase hooks** (claude_sync, search_index, activity_aggregation)
3. **Comic design system** (all Comic* components)
4. **MyTrend data models** (conversations, ideas, topics, activity_aggregates)
5. **Internal API calls to PocketBase** (syncProjectToPB, extractIdeaFromMessage)
6. **Natural language cron parser** (moved to Companion if needed later)

### 6C. Phase Breakdown Summary

**Phase 1: Foundation (Week 1)**
- Monorepo scaffold with Bun workspaces
- Drizzle schema + migrations
- @companion/shared types package
- Basic Hono server with health check
- SQLite database initialization

**Phase 2: CLI Bridge (Week 1-2)**
- Port WsBridge with SQLite backing
- Port CLILauncher
- Port SessionStore (rewrite for Drizzle)
- WebSocket upgrade on Bun.serve
- REST API for sessions CRUD

**Phase 3: Telegram System (Week 2)**
- Port BotRegistry + TelegramBridge
- Port all commands (remove MyTrend-specific ones)
- Telegram config in SQLite
- Test multi-bot with real tokens

**Phase 4: Web UI Core (Week 2-3)**
- Next.js 16 scaffold with TailwindCSS 4
- shadcn/ui setup with custom theme
- Layout (sidebar, header, command palette)
- Dashboard page
- Session list + session terminal page
- WebSocket hook for real-time updates

**Phase 5: Advanced Features (Week 3-4)**
- Analytics pages (cost tracking, usage charts)
- Project management UI
- Settings pages (Telegram config, projects, appearance)
- MCP server list viewer

**Phase 6: AntiGravity (Week 4)**
- Port CDP client
- Port chat/task watchers
- VS Code extension bridge
- AntiPanel in web UI

**Phase 7: Polish & Deploy (Week 4-5)**
- Dockerfile (single container)
- docker-compose.yml
- CI/CD (GitHub Actions)
- Migration script from MyTrend
- Documentation
- CLAUDE.md for the new project

---

## 7. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bun + Next.js compatibility | High | Use `bun run next dev`, test early in Phase 4. Fallback: serve Next.js static export from Hono |
| SQLite migration from file-based JSON | Medium | Write migration script that reads existing JSON sessions and imports to SQLite |
| Telegram bot token handling | Medium | Encrypt tokens in SQLite (reuse existing encryption pattern from SessionStore) |
| WebSocket reliability across frameworks | Medium | Keep Bun.serve native WS (proven), Next.js client connects to server WS directly |
| Scope creep in UI rewrite | High | Strict phase boundaries. Phase 4 = minimum viable terminal. Phase 5 = analytics. Do not mix. |
| Lost MyTrend features during extraction | Low | Maintain STRUCTURE.yaml as reference. Check off each feature as ported or intentionally dropped |

---

## 8. Architecture Decision Records

### ADR-001: Next.js 16 over SvelteKit 5
- **Context**: Existing frontend is SvelteKit 5 with Comic design system
- **Decision**: Rewrite in Next.js 16 + TailwindCSS 4 + shadcn/ui
- **Rationale**: Comic design is MyTrend-specific and cannot be reused. Since UI rewrite is required regardless, pick the framework that matches user's SaaS preferences and has the richest component ecosystem.

### ADR-002: SQLite + Drizzle over PocketBase
- **Context**: MyTrend uses PocketBase (Go binary) with Goja hooks
- **Decision**: Replace with embedded SQLite via Drizzle ORM
- **Rationale**: Companion is local-first. PocketBase adds a separate process, Docker container, and ES5.1 hook limitation. SQLite is embedded, zero-ops, and Drizzle provides type-safe queries. The WsBridge already handles real-time -- PocketBase subscriptions are redundant.

### ADR-003: Single-container deployment
- **Context**: MyTrend uses 3 containers (PocketBase + SvelteKit + Nginx)
- **Decision**: Single Dockerfile producing one container
- **Rationale**: Companion is a developer tool, not a multi-service SaaS. One process = simpler debugging, lower resource usage, easier distribution.

### ADR-004: Keep Bun + Hono
- **Context**: Backend already runs on Bun + Hono with native WebSocket
- **Decision**: Keep as-is
- **Rationale**: Works well, no benefit from migration. Bun.serve native WS is a key architectural advantage.

### ADR-005: Bun workspaces over Turborepo
- **Context**: Need monorepo for shared types between server and web
- **Decision**: Use Bun workspace protocol
- **Rationale**: Only 3 packages. Turborepo adds config overhead without meaningful benefit at this scale.
