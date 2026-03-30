# Phase 4: Cost Budget Warning System

## Goal
Configurable cost budget per session — warn at threshold, user decides to continue or stop. Never auto-kill.

## Tasks
- [ ] Track cost in real-time: update `total_cost_usd` on each `/result` message
- [ ] Check budget after each cost update: if `total_cost_usd >= costBudgetUsd * 0.8` → first warning
- [ ] Second warning at 100% budget reached
- [ ] Web: toast notification (Sonner) when budget warning triggers
- [ ] Web: cost display turns yellow at 80%, red at 100% in session header
- [ ] Telegram: send budget warning message to mapped chat
- [ ] Add `costBudgetUsd` to session creation API (optional)
- [ ] Add `costBudgetUsd` to session settings API (runtime update)
- [ ] Prevent duplicate warnings (use `costWarned` flag: 0=none, 1=first, 2=second)

## Acceptance Criteria
- [ ] Setting $5 budget → warning at $4, second at $5
- [ ] Session continues running after warnings (no auto-stop)
- [ ] Warnings appear on both web + Telegram if connected
- [ ] Budget can be set at creation or changed mid-session
- [ ] No budget = no warnings (default behavior unchanged)

## Files Touched
- `packages/server/src/services/ws-bridge.ts` — modify (cost check logic)
- `packages/server/src/services/session-store.ts` — modify (update costWarned)
- `packages/server/src/routes/sessions.ts` — modify (settings endpoint)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (cost warning handler)
- `packages/web/src/components/grid/session-header.tsx` — modify (visual warning)

## Dependencies
- Phase 1 (costBudgetUsd, costWarned fields)
