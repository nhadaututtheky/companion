# Phase 1: Control Protocol

## Goal
Add real-time context usage polling via `get_context_usage` control_request, and mid-session model switching UI. Interrupt already works — no changes needed.

## Tasks
- [x] Task 1 — Server: Send `get_context_usage` control_request after each turn idle
- [x] Task 2 — Server: Handle `control_response` for context usage, broadcast to browsers
- [x] Task 3 — Web: Add mid-session model selector in session header
- [x] Task 4 — Web: Wire model selector to existing `set_model` WebSocket message
- [x] Task 5 — Web: Update context meter to show real-time data from polling
- [x] Task 6 — Verify: Type check passes (0 new errors)

## Acceptance Criteria
- [x] Context meter updates after each turn with accurate token counts
- [x] User can switch model mid-session from session header
- [x] Model switch takes effect on next turn (no session restart)
- [x] No regression on existing interrupt/stop functionality

## Files Touched
- `packages/server/src/services/ws-bridge.ts` — modified (context polling, control_response handling)
- `packages/web/src/components/session/model-selector.tsx` — new (model dropdown component)
- `packages/web/src/components/session/session-details.tsx` — modified (pass contextMaxTokens to meter)
- `packages/web/src/app/sessions/[id]/session-page-client.tsx` — modified (model selector + real-time context)
- `packages/web/src/hooks/use-session.ts` — modified (setModel, context_update handling)
- `packages/web/src/lib/stores/session-store.ts` — modified (context fields)

## Dependencies
- Requires Claude Code CLI to support `get_context_usage` (graceful degradation if not supported)
- Requires existing WebSocket infrastructure (already in place)
