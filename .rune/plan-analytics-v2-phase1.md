# Phase 1: Bug Fix + Data Layer

## Goal
Fix the infinite loop crash on session detail page. Add RTK columns to DB and persist RTK stats when sessions update.

## Data Flow
```
[Debate Store]                    [Session Page]
  getParticipants() → new []  →  selector re-render → infinite loop
  FIX: select raw data, not method call

[ws-bridge.ts]                    [DB: sessions table]
  rtk accumulate per-turn  →     NEW: rtkTokensSaved, rtkCompressions, rtkCacheHits columns
  updateSessionRecord()    →     persist RTK fields alongside existing metrics
```

## Code Contracts

```typescript
// Migration 0032: add RTK columns to sessions
ALTER TABLE sessions ADD COLUMN rtk_tokens_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN rtk_compressions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN rtk_cache_hits INTEGER NOT NULL DEFAULT 0;

// Schema addition (schema.ts sessions table)
rtkTokensSaved: integer("rtk_tokens_saved").notNull().default(0),
rtkCompressions: integer("rtk_compressions").notNull().default(0),
rtkCacheHits: integer("rtk_cache_hits").notNull().default(0),

// session-store.ts — new function or extend updateSessionMetrics
function updateSessionRTK(id: string, rtk: { tokensSaved: number; compressions: number; cacheHits: number }): void
```

## Tasks

### Wave 1 — Bug Fix (independent, no DB changes)

#### Task 1A: Fix debate store infinite loop
- **File**: `packages/web/src/app/sessions/[id]/session-page-client.tsx` — modify line 187-189
- **touches**: [session-page-client.tsx]
- **provides**: [stable debateParticipants selector]
- **requires**: []
- **Logic**: Replace `useDebateStore((s) => s.getParticipants(id))` with `useDebateStore((s) => s.participants[id] ?? EMPTY_ARRAY)` where `EMPTY_ARRAY` is a module-level constant `[] as const`. Same fix for `addParticipant` and `removeParticipant` selectors — extract stable references.
- **Edge case**: `s.participants[id]` may be undefined for sessions without debate — the `?? EMPTY_ARRAY` handles this.
- **Verify**: Navigate from Analytics → click session ID → no crash, no console errors about max update depth.

### Wave 2 — DB Migration + Schema (sequential, depends on nothing frontend)

#### Task 2A: Create migration 0032
- **File**: `packages/server/src/db/migrations/0032_rtk_columns.sql` — new
- **touches**: [0032_rtk_columns.sql]
- **provides**: [rtk_tokens_saved, rtk_compressions, rtk_cache_hits columns]
- **requires**: []
- **Logic**: Three ALTER TABLE ADD COLUMN statements. All INTEGER NOT NULL DEFAULT 0.
- **Edge case**: Existing sessions get 0 for all RTK fields — correct since we didn't track before.

#### Task 2B: Update schema.ts
- **File**: `packages/server/src/db/schema.ts` — modify (after line 102, after `totalLinesRemoved`)
- **touches**: [schema.ts]
- **provides**: [Drizzle schema with RTK columns]
- **requires**: [Task 2A migration exists]
- **Logic**: Add 3 columns: `rtkTokensSaved`, `rtkCompressions`, `rtkCacheHits` — same pattern as existing metrics columns.

#### Task 2C: Regenerate embedded-migrations.ts
- **File**: `packages/server/src/db/embedded-migrations.ts` — regenerate
- **touches**: [embedded-migrations.ts]
- **provides**: [embedded migration including 0032]
- **requires**: [Task 2A]
- **Logic**: Run the project's migration embed script. Check existing embedded-migrations.ts for the generation command (likely a build step or script).
- **Edge case**: MUST regenerate — forgetting this is a known issue (see feedback_embedded_migrations.md).

### Wave 3 — Persist RTK Data (depends on Wave 2)

#### Task 3A: Persist RTK stats on session metric updates
- **File**: `packages/server/src/services/session-store.ts` — modify
- **touches**: [session-store.ts]
- **provides**: [RTK persistence on updateSessionMetrics]
- **requires**: [Task 2B schema]
- **depends_on**: [task-2b]
- **Logic**: Find the function that updates session metrics (called from ws-bridge.ts after each turn). Add RTK fields to the DB update. Currently ws-bridge.ts accumulates RTK in session.state (in-memory) — we need to also write to DB.
- **Edge case**: RTK may be disabled (config) — values stay 0, which is fine.

#### Task 3B: Update ws-bridge RTK accumulation to trigger DB persist
- **File**: `packages/server/src/services/ws-bridge.ts` — modify (around line 1643-1645)
- **touches**: [ws-bridge.ts]
- **provides**: [RTK stats flow from in-memory to DB]
- **requires**: [Task 3A]
- **depends_on**: [task-3a]
- **Logic**: After accumulating `rtk_tokens_saved/compressions/cache_hits` in session.state, also call the DB update function. Look at how `totalCostUsd` and `numTurns` are persisted — follow the same pattern for RTK.
- **Edge case**: Don't double-count — accumulate delta per turn, not total. Check if existing pattern uses delta or absolute.

## Failure Scenarios

| When | Then | Error |
|------|------|-------|
| Migration fails (column already exists) | SQLite ignores duplicate ADD COLUMN | Safe — idempotent |
| RTK disabled for session | All RTK values stay 0 | Correct behavior |
| Session ends before any RTK runs | 0/0/0 persisted | Correct |
| embedded-migrations.ts not regenerated | Server won't apply migration on startup | Build will work but DB won't have columns — runtime error on persist |

## Rejection Criteria
- DO NOT call store methods inside Zustand selectors (the bug we're fixing)
- DO NOT create new array/object references in selectors — use module-level constants
- DO NOT modify RTK pipeline logic — only add persistence
- DO NOT use `?? []` inside selectors — use `?? EMPTY_ARRAY` constant

## Cross-Phase Context
- **Assumes**: Nothing from prior phases (this is Phase 1)
- **Exports for Phase 2**: RTK columns available in sessions table for aggregate queries. Source column already exists. `startedAt` already exists.

## Acceptance Criteria
- [ ] Clicking session ID in Analytics → no infinite loop, page loads correctly
- [ ] RTK columns exist in DB after migration
- [ ] After a session with RTK active, `rtk_tokens_saved > 0` in sessions table
- [ ] `SELECT rtk_tokens_saved, rtk_compressions, rtk_cache_hits FROM sessions WHERE id = ?` returns non-zero for RTK-active sessions
- [ ] embedded-migrations.ts includes migration 0032
