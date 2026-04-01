# Phase 4: Polish — Error Handling, Edge Cases, Tests

## Goal

Harden the scheduler against failures, add run history tracking, write tests,
and handle edge cases (timezone DST, overlapping runs, server restart recovery).

## Tasks

### Error Handling + Run History
- [ ] Add `schedule_runs` table — `packages/server/src/db/schema.ts`
  - Fields: id, scheduleId, sessionId, status (success/failed/skipped), startedAt, error
- [ ] Log each scheduler execution into `schedule_runs` for audit trail
- [ ] On session launch failure: record error in `schedule_runs`, keep schedule enabled
- [ ] On session limit reached: record as "skipped" with reason, retry next tick
- [ ] Add `GET /api/schedules/:id/runs` endpoint — run history for a schedule
- [ ] Show run history in schedule detail view (web)

### Edge Cases
- [ ] DST handling: use timezone-aware cron evaluation (cron-parser supports tz)
- [ ] Overlapping prevention: skip if previous run from same schedule is still active
- [ ] Server restart recovery: on boot, check for missed `once` triggers + overdue cron runs
- [ ] Stale nextRunAt: if nextRunAt is in the past (server was down), compute fresh next run
- [ ] Schedule deletion: cancel any pending run, clean up `schedule_runs` (cascade or keep)
- [ ] Concurrent tick protection: mutex/flag so two ticks don't evaluate simultaneously

### Tests
- [ ] `packages/server/src/services/scheduler.test.ts` — unit tests
  - Cron expression parsing + next run computation
  - Tick evaluation selects correct due schedules
  - One-time schedule disables after execution
  - Session limit skip behavior
  - Missed run detection on boot
- [ ] `packages/server/src/routes/schedules.test.ts` — API integration tests
  - CRUD operations with validation
  - Toggle endpoint behavior
  - Run-now endpoint
  - Upcoming endpoint ordering
- [ ] `packages/web/src/components/schedule/__tests__/` — component tests
  - Calendar renders correct month grid
  - Form validation (cron syntax, required fields)
  - Toggle switch calls API

### Notifications
- [ ] When scheduled session fails to launch, send notification via existing Telegram bot
  - Use `notificationGroupId` from `telegramBots` table
- [ ] Add schedule failure to WebSocket broadcast (web UI shows toast via Sonner)

## Schema: `schedule_runs` Table

```
id          INTEGER PK AUTOINCREMENT
scheduleId  TEXT FK → schedules.id
sessionId   TEXT     — created session ID (null if failed/skipped)
status      TEXT     — 'success' | 'failed' | 'skipped'
reason      TEXT     — error message or skip reason
startedAt   INTEGER (timestamp_ms)
```

## Acceptance Criteria

- [ ] Schedule runs table exists and populated on each scheduler execution
- [ ] Failed launches logged with error, schedule stays enabled
- [ ] Skipped runs (capacity) logged with reason
- [ ] No overlapping runs from same schedule
- [ ] Server restart correctly recovers missed one-time triggers
- [ ] DST transition does not cause double-fire or missed fire
- [ ] At least 15 unit tests for scheduler service
- [ ] At least 8 API integration tests for schedule routes
- [ ] Telegram notification sent on schedule failure (when bot configured)
- [ ] WebSocket broadcast on schedule events (fired/failed/skipped)

## Files Touched

- `packages/server/src/db/schema.ts` — modify (add schedule_runs table)
- `packages/server/src/db/migrations/` — new migration
- `packages/server/src/services/scheduler.ts` — modify (run logging, overlap check, recovery)
- `packages/server/src/routes/schedules.ts` — modify (add runs endpoint, notifications)
- `packages/server/src/services/scheduler.test.ts` — new
- `packages/server/src/routes/schedules.test.ts` — new
- `packages/web/src/components/schedule/__tests__/` — new (component tests)
- `packages/web/src/components/schedule/schedule-runs.tsx` — new (run history view)

## Dependencies

- Requires Phase 1-3 completed
- Uses existing `BotRegistry` for Telegram notifications
- Uses existing WebSocket broadcast pattern from `ws-bridge.ts`
