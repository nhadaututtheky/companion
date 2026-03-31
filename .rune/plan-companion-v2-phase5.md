# Phase 5: MyTrend Feature Port

## Goal

Port high-value patterns from MyTrend PRs into Companion. Focus on compact re-injection (P1), WS race condition fix (P1), and session stats UI (P2).

## Tasks

### Auto-onCompact Identity Re-injection (from MyTrend PR #3)
- [ ] Research: read how Companion currently handles compact events
  - `packages/server/src/services/ws-bridge.ts` — compact mode logic
  - `packages/server/src/telegram/telegram-bridge.ts` — compact settings
- [ ] Implement: when compact completes, auto-inject session identity/context
  - Store session identity prompt (from CLAUDE.md or user-set personality)
  - After compact event detected, send identity re-injection message to CLI
  - Configurable: on/off per session
- [ ] Test: compact a session → verify identity prompt re-injected

### WebSocket Race Condition Fix (from MyTrend PR #2)
- [ ] Audit `ws-bridge.ts` for the same timing window as MyTrend
  - Pattern: `result` arrives via WS during `sendMessage` await, before handler is ready
- [ ] Implement `earlyResultKeys` Set pattern if race exists
  - Buffer early results → replay when handler subscribes
- [ ] Test: rapid message sending → no orphaned states

### Session Activity Stats (from MyTrend PR #1)
- [ ] Server: add `GET /api/stats` endpoint
  - Today sessions count, week total, streak (consecutive days with sessions)
  - Token usage breakdown by model
  - Top projects by session count
  - Daily activity for last 30 days (heatmap data)
  - `packages/server/src/routes/index.ts` — new route
- [ ] Web: stats dashboard panel
  - KPI cards: today / week / streak / total tokens
  - Activity heatmap (30 days)
  - Model usage pie/bar chart
  - `packages/web/src/components/stats-panel.tsx` — new

### Session Data Table Enhancement (from MyTrend PR #1)
- [ ] Web: sortable session list in sidebar
  - Sort by: date, cost, tokens, model
  - Search: filter sessions by name/project
  - `packages/web/src/components/sidebar.tsx` — enhance

## Acceptance Criteria

- [ ] After compact, session retains personality/context
- [ ] No orphaned WS states under rapid messaging
- [ ] Stats panel shows streak, heatmap, model breakdown
- [ ] Session list sortable by multiple criteria

## Files Touched

- `packages/server/src/services/ws-bridge.ts` — compact re-injection, race condition fix
- `packages/server/src/routes/index.ts` — stats endpoint
- `packages/web/src/components/stats-panel.tsx` — new
- `packages/web/src/components/sidebar.tsx` — sortable list

## Dependencies

- Phase 1-3 completed (stable base)

## Review Gate

- [ ] `bun run build` passes
- [ ] Manual test: compact session → send message → Claude still knows context
- [ ] Manual test: stats panel loads with real data
- [ ] Manual test: sort sessions by cost → correct order
