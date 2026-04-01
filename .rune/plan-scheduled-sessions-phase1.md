# Phase 1: DB Schema + Scheduler Service

## Goal

Create the `schedules` table in SQLite and an in-process scheduler service that evaluates
pending schedules every 60 seconds, launching sessions when triggers fire.

## Tasks

- [ ] Add `schedules` table to Drizzle schema — `packages/server/src/db/schema.ts`
- [ ] Add `telegramTarget` JSON column to `sessions` table (nullable)
- [ ] Generate + apply Drizzle migration — `packages/server/src/db/migrations/`
- [ ] Create `packages/server/src/services/scheduler.ts` — tick loop + cron evaluator
- [ ] Add `cron-parser` dependency to `packages/server/package.json`
- [ ] Wire scheduler startup in `packages/server/src/index.ts` (start on boot, stop on SIGTERM)
- [ ] Handle missed runs on boot — check `lastRunAt` vs `nextRunAt` for enabled schedules
- [ ] Add shared types in `packages/shared/src/types/schedule.ts`

## Schema: `schedules` Table

```
id              TEXT PK (nanoid)
name            TEXT NOT NULL
projectSlug     TEXT FK → projects.slug
prompt          TEXT           — raw prompt text
templateId      TEXT           — OR reference to session_templates.id
templateVars    TEXT (JSON)    — variables for template resolution
model           TEXT NOT NULL
permissionMode  TEXT DEFAULT 'default'
triggerType     TEXT NOT NULL   — 'once' | 'cron'
cronExpression  TEXT           — e.g. '0 9 * * 1-5'
scheduledAt     INTEGER        — epoch ms for 'once' triggers
timezone        TEXT DEFAULT 'UTC'
telegramTarget  TEXT (JSON)    — { mode: 'off' | 'private' | 'group', botId?, chatId?, topicId? }
autoStopRules   TEXT (JSON)    — { maxCostUsd?, maxTurns?, maxDurationMs? }
enabled         INTEGER BOOLEAN DEFAULT true
lastRunAt       INTEGER (timestamp_ms)
nextRunAt       INTEGER (timestamp_ms)  — pre-computed for fast tick queries
runCount        INTEGER DEFAULT 0
createdAt       INTEGER (timestamp_ms)
updatedAt       INTEGER (timestamp_ms)
```

## Scheduler Service Design

1. `startScheduler()` — called once on server boot
2. `setInterval(tick, 60_000)` — every 60s, query `WHERE enabled=1 AND nextRunAt <= now()`
3. For each due schedule: launch session via `WsBridge.startSession()`, update `lastRunAt`, compute `nextRunAt`
4. For `triggerType='once'`: set `enabled=false` after execution
5. For `triggerType='cron'`: compute next occurrence via `cron-parser`
6. Respect `getMaxSessions()` — skip if at capacity (log warning, retry next tick)
7. On boot: scan for missed `once` triggers (scheduledAt < now, never ran) — execute immediately

## Acceptance Criteria

- [ ] `schedules` table exists with all columns, indexes on `enabled+nextRunAt`
- [ ] `sessions.telegramTarget` column exists (nullable JSON)
- [ ] Scheduler tick fires every 60s and correctly identifies due schedules
- [ ] One-time schedule fires and auto-disables
- [ ] Cron schedule fires and computes correct next run
- [ ] Session limit respected — skipped schedules logged, retried next tick
- [ ] Server shutdown cleanly stops the tick interval

## Files Touched

- `packages/server/src/db/schema.ts` — modify (add schedules table + sessions.telegramTarget)
- `packages/server/src/db/migrations/` — new migration
- `packages/server/src/services/scheduler.ts` — new
- `packages/server/src/index.ts` — modify (wire scheduler)
- `packages/shared/src/types/schedule.ts` — new
- `packages/shared/src/types/index.ts` — modify (re-export)
- `packages/server/package.json` — modify (add cron-parser)

## Dependencies

- None — this is the foundation phase
