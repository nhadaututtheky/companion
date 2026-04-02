# Feature: Scheduled Sessions

## Overview

Users can schedule Claude Code sessions to run at specific times or recurring intervals (cron).
Includes per-session Telegram target config, a session config popover consolidating scattered buttons,
and a visual calendar showing upcoming runs.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | DB Schema + Scheduler Service | ✅ Done | plan-scheduled-sessions-phase1.md | New `schedules` table, cron evaluator, tick loop |
| 2 | REST API + Telegram Target | ✅ Done | plan-scheduled-sessions-phase2.md | CRUD routes, per-session telegram target field |
| 3 | Web UI | ⬚ Pending | plan-scheduled-sessions-phase3.md | Calendar view, config popover, schedule CRUD forms |
| 4 | Polish + Tests | ⬚ Pending | plan-scheduled-sessions-phase4.md | Error handling, edge cases, unit/integration tests |

## Key Decisions

- Use `cron-parser` (MIT, zero-dep) for cron expression evaluation — no OS-level crontab
- Scheduler runs in-process via `setInterval` tick (60s) — simple, no external dependency
- Schedules stored in SQLite alongside sessions — single source of truth
- Telegram target stored as JSON column on both `schedules` and `sessions` tables
- Config popover replaces individual settings buttons but keeps session-details panel for deep view
- Calendar uses lightweight custom component (no heavy lib) — month grid + day dots

## Constraints

- Self-hosted Docker app — scheduler must survive restarts (evaluate missed runs on boot)
- SQLite single-writer — tick loop must be fast (< 100ms per evaluation cycle)
- Max concurrent sessions enforced by license — scheduler respects the limit
- All times stored as UTC; UI converts to local timezone
