# Phase 1: Foundation

## Goal
Scaffold the monorepo, set up the database schema, and create a minimal bootable server that proves the architecture works.

## Tasks
- [ ] Initialize Bun workspace root with `package.json` (workspaces config)
- [ ] Create `packages/shared/` with session types, Telegram types, API types (ported from MyTrend)
- [ ] Create `packages/server/` with Hono app skeleton
- [ ] Set up Drizzle ORM with SQLite (schema.ts, client.ts, drizzle.config.ts)
- [ ] Define all tables: sessions, session_messages, projects, telegram_bots, daily_costs, settings
- [ ] Generate and run initial migration
- [ ] Implement health check route (`GET /api/health`)
- [ ] Port logger.ts (copy as-is)
- [ ] Port rate-limiter.ts (copy as-is)
- [ ] Create `.env.example` with all required env vars
- [ ] Create basic `tsconfig.json` per package with path aliases
- [ ] Verify `bun dev` starts the server and DB initializes

## Acceptance Criteria
- [ ] `bun install` from root installs all workspace deps
- [ ] `bun dev` starts server on port 3457
- [ ] `GET /api/health` returns 200 with DB status
- [ ] SQLite file created at `data/companion.db`
- [ ] All tables exist (verify with `sqlite3` or Drizzle Studio)
- [ ] TypeScript strict mode passes (`bun run check`)

## Files Touched
- `package.json` -- new (workspace root)
- `packages/shared/package.json` -- new
- `packages/shared/src/types/session.ts` -- new (port from session-types.ts)
- `packages/shared/src/types/telegram.ts` -- new (port from telegram-types.ts)
- `packages/shared/src/types/api.ts` -- new
- `packages/shared/src/constants.ts` -- new
- `packages/server/package.json` -- new
- `packages/server/src/index.ts` -- new
- `packages/server/src/db/schema.ts` -- new
- `packages/server/src/db/client.ts` -- new
- `packages/server/src/db/migrations/` -- new (auto-generated)
- `packages/server/src/routes/health.ts` -- new
- `packages/server/src/logger.ts` -- new (copy)
- `packages/server/src/middleware/rate-limiter.ts` -- new (copy)
- `packages/server/drizzle.config.ts` -- new
- `tsconfig.json` -- new (root)
- `.env.example` -- new

## Dependencies
- None (first phase)
