# Companion Codebase Scan — File Index

This directory contains comprehensive documentation of the Companion codebase.
Generated: 2026-03-22

## Documentation Files Created

### 1. **CODEBASE_SCAN.md** — Complete Reference
Full technical analysis of the entire codebase:
- Project structure (all directories)
- Tech stack breakdown
- Database schema (13 tables)
- API routes (20 endpoints)
- Core services (25 modules with descriptions)
- Frontend pages & components
- Client-side state management
- Database migrations
- Build & deployment
- Configuration files
- Test coverage
- Project health metrics

**Use when**: You need deep technical details about any component

---

### 2. **QUICK_REFERENCE.md** — Cheat Sheet
Quick lookup guide for common tasks:
- Directory map (must-know paths)
- Database table quick reference
- API endpoints summary
- Tech stack at a glance
- Common commands (bun run *)
- Page routes
- Danger zones
- Testing status
- Environment variables
- Docker deployment
- CI/CD pipeline

**Use when**: You need quick answers without deep diving

---

### 3. **ARCHITECTURE.md** — System Design
High-level architecture and design patterns:
- Architecture diagram (ASCII)
- Data flow (session creation, messages, Telegram, debates)
- Component dependencies (frontend)
- Service dependencies (backend)
- Database relationships
- Authentication & security flow
- Deployment pipeline
- Runtime architecture (Docker)
- Type safety architecture
- Design patterns used
- Error handling strategy
- Performance optimizations
- Scalability considerations

**Use when**: You're understanding system design or adding features

---

### 4. **SCAN_INDEX.md** (This file)
Navigation guide for all scan documentation

---

## File Structure at a Glance

```
companion/
├── CODEBASE_SCAN.md      ← Full technical analysis
├── QUICK_REFERENCE.md    ← Cheat sheet
├── ARCHITECTURE.md       ← System design & diagrams
├── SCAN_INDEX.md         ← This file
│
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts                # Entry point
│   │   │   ├── db/                     # Database (schema, migrations)
│   │   │   ├── routes/                 # API endpoints
│   │   │   ├── services/               # Business logic (8.6k LOC)
│   │   │   ├── telegram/               # Telegram integration
│   │   │   └── mcp/                    # MCP server
│   │   ├── drizzle.config.ts           # ORM config
│   │   └── package.json
│   │
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/                    # Pages (Next.js App Router)
│   │   │   ├── components/             # React components (30+)
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts       # API wrapper
│   │   │   │   └── stores/             # Zustand stores (5)
│   │   │   └── hooks/                  # Custom hooks
│   │   ├── next.config.ts              # Next.js config
│   │   └── package.json
│   │
│   └── shared/
│       ├── src/
│       │   ├── constants.ts            # Shared constants
│       │   ├── types/                  # Shared types
│       │   └── index.ts
│       └── package.json
│
├── .github/
│   └── workflows/
│       ├── docker-publish.yml          # CI/CD (Docker build)
│       └── landing-page.yml            # Landing page deploy
│
└── Root configs
    ├── package.json                    # Workspace root (Bun)
    ├── Dockerfile                      # Multi-stage build
    ├── docker-compose.yml              # Local dev setup
    ├── tsconfig.json                   # Shared TS config
    ├── eslint.config.js                # Linting rules
    ├── .prettierrc                     # Formatter config
    └── .env.example                    # Environment template
```

---

## Quick Navigation by Use Case

### "I need to understand the database"
→ **CODEBASE_SCAN.md** Section 3 (Database Schema)
→ **ARCHITECTURE.md** (Database Relationships)

### "I need to add a new API endpoint"
→ **QUICK_REFERENCE.md** (API Endpoints section)
→ **CODEBASE_SCAN.md** Section 5 (Core Services)
→ **packages/server/src/routes/** (existing examples)

### "I need to fix a bug in the frontend"
→ **CODEBASE_SCAN.md** Section 6 (Frontend Pages & Components)
→ **QUICK_REFERENCE.md** (Page Routes)
→ **ARCHITECTURE.md** (Component Dependencies)

### "I need to understand Telegram integration"
→ **CODEBASE_SCAN.md** Section 5 (Telegram Services)
→ **ARCHITECTURE.md** (Telegram Integration Flow)
→ **packages/server/src/telegram/** (code)

### "I need to deploy this"
→ **QUICK_REFERENCE.md** (Docker Deployment)
→ **ARCHITECTURE.md** (Deployment Pipeline)
→ **docker-compose.yml** (local setup)

### "I need to work with debates/channels"
→ **CODEBASE_SCAN.md** Section 3 (channels, channelMessages tables)
→ **ARCHITECTURE.md** (Debate Flow)
→ **packages/server/src/services/debate-engine.ts** (code)

### "I need to understand the tech stack"
→ **QUICK_REFERENCE.md** (Tech Stack section)
→ **CODEBASE_SCAN.md** Section 2 (Tech Stack Summary)
→ **packages/*/package.json** (exact versions)

### "I need to check project health"
→ **QUICK_REFERENCE.md** (Project Health section)
→ **CODEBASE_SCAN.md** Section 14 (Project Health Metrics)

---

## Key Statistics

- **Total TypeScript files**: 60+
- **React components**: 30+
- **Backend services**: 25+
- **Database tables**: 13
- **API routes**: 20
- **Telegram commands**: 8
- **Test files**: 4 (low coverage)
- **Migration files**: 4
- **Lines of code** (services): 8,636
- **Config files**: 10+

---

## Architecture Overview

```
┌─── Clients ───────────────────────┐
│ Browser | Telegram | MCP Clients  │
└─────────────┬─────────────────────┘
              │
    ┌─────────▼────────────┐
    │  Hono HTTP Server    │
    │  (Port 3579)         │
    ├──────────────────────┤
    │ 20 API Routes        │
    │ + WebSocket Support  │
    └────────┬─────────────┘
             │
    ┌────────▼────────────────┐
    │  25 Core Services       │
    │  (AI, Sessions,         │
    │   Telegram, Debates)    │
    └────────┬────────────────┘
             │
    ┌────────▼────────────┐
    │  SQLite Database    │
    │  (13 tables)        │
    └─────────────────────┘

    ┌─────────────────────────┐
    │  Next.js Web            │
    │  (Port 3580)            │
    ├─────────────────────────┤
    │ 6 Pages                 │
    │ 30+ Components          │
    │ 5 Zustand Stores        │
    └─────────────────────────┘
```

---

## Key Entry Points

| Component | File | Function |
|-----------|------|----------|
| **Server** | `packages/server/src/index.ts` | Startup, migrations, license |
| **Web** | `packages/web/src/app/layout.tsx` | Root layout |
| **Database** | `packages/server/src/db/schema.ts` | 13 table definitions |
| **Telegram** | `packages/server/src/telegram/bot-registry.ts` | Bot management |
| **MCP** | `packages/server/src/mcp/index.ts` | MCP server |

---

## Danger Zones (Needs Extra Testing)

1. **cli-launcher.ts** — Subprocess spawning
2. **ws-bridge.ts** — WebSocket message routing (critical)
3. **license.ts** — License verification
4. **anti-cdp.ts** — Cursor/Codeium detection

---

## Getting Started Commands

```bash
# Development
bun run dev:server             # Start server
bun run dev:web                # Start web UI
bun run check                  # Type check

# Database
bun run db:generate            # Create migration
bun run db:migrate             # Run migration

# Production
docker compose up --build      # Local Docker
bun run build                  # Build all

# Code Quality
bun run lint                   # ESLint check
bun run format                 # Prettier format
```

---

## Project Health

| Check | Status | Notes |
|-------|--------|-------|
| Type Safety | ✅ | TS strict mode |
| Linting | ✅ | ESLint v10 configured |
| Tests | ⚠️ | <5% coverage (4 test files) |
| Documentation | ✅ | Comprehensive (this scan) |
| Error Handling | ✅ | Good try-catch coverage |
| Logging | ✅ | Structured logging |

---

## Related Documentation

- **CLAUDE.md** — Project instructions & guidelines
- **AUDIT-REPORT.md** — Project audit findings
- **.rune/plan-*.md** — Phase-based implementation plans (80+ docs)

---

## How to Use This Documentation

1. **Start here** → SCAN_INDEX.md (this file)
2. **Quick answers** → QUICK_REFERENCE.md
3. **Deep dive** → CODEBASE_SCAN.md or ARCHITECTURE.md
4. **Specific task** → Use the "Quick Navigation by Use Case" section above

---

## Keeping Documentation Updated

When you make significant changes:
1. Update relevant section in one of the 3 main docs
2. Update QUICK_REFERENCE.md if it affects quick reference items
3. Update ARCHITECTURE.md if it changes system flow
4. Keep SCAN_INDEX.md current with new files

---

**Last Updated**: 2026-03-22
**Maintainer**: Companion Development Team
**Next Review**: 2026-04-22

Happy coding!
