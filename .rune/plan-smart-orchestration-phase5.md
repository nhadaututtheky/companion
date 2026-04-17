# Phase 5: UI + Feedback Loop

## Goal
Show dispatch suggestions in the web UI so users can see, confirm, or override orchestration decisions. Track accept/reject to improve future classifications.

## Tasks
- [x] Create dispatch-store.ts — ephemeral store for current suggestion
- [x] Add WS event handling for dispatch:classified in session hook
- [x] Create DispatchSuggestion component — badge + confirm/override/dismiss
- [x] Wire DispatchSuggestion into message-composer area
- [x] Add dispatch feedback REST API (preview + confirm endpoints)
- [x] Server: wire EventBus dispatch events → WS broadcast in index.ts
- [x] Add dispatch API client functions (preview, confirm)
- [x] Pass sessionId prop to all MessageComposer usages

## Acceptance Criteria
- [x] When classifier fires, suggestion appears in composer (confidence >= 0.5)
- [x] High confidence (>=0.8) shows "Auto" badge (can still cancel)
- [x] User can override pattern via dropdown before confirming
- [x] Dismiss hides suggestion without action
- [x] TypeScript compiles clean (web + server)

## Files Touched
- `packages/web/src/lib/stores/dispatch-store.ts` — new
- `packages/web/src/components/session/dispatch-suggestion.tsx` — new
- `packages/web/src/components/session/message-composer.tsx` — modify (add suggestion)
- `packages/web/src/hooks/use-session.ts` — modify (dispatch event handler)
- `packages/web/src/lib/api/sessions.ts` — modify (dispatch API)
- `packages/web/src/app/sessions/[id]/session-page-client.tsx` — modify (pass sessionId)
- `packages/web/src/components/grid/expanded-session.tsx` — modify (pass sessionId)
- `packages/web/src/components/layout/session-pane.tsx` — modify (pass sessionId)
- `packages/server/src/index.ts` — modify (EventBus → WS bridge)
- `packages/server/src/routes/sessions.ts` — modify (dispatch-preview + dispatch-confirm routes)

## Dependencies
- Requires Phase 1-4 completed (classifier, router, curator, memory)
- Uses WebSocket singleton from use-websocket.ts
