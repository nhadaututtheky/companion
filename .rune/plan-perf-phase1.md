# Phase 1: WebSocket Singleton

## Goal
Eliminate duplicate WS connections — currently each `useSession()` call opens a new WebSocket. Same session can have 2–4 concurrent connections from MiniTerminal + ExpandedSession + SessionPane.

## Tasks
- [x] Module-level singleton Map (per sessionId) with ref-counting
- [x] Ref-counted subscribe/unsubscribe — connect on first, disconnect on last
- [x] `useWebSocket` hook is drop-in wrapper — `useSession` unchanged
- [x] Child sessions get own connection (different sessionId = different entry)
- [x] Max 10 retries, permanent close codes (4001, 4004) skip retry
- [x] Late subscribers get immediate status notification
- [x] Type-check pass

## Acceptance Criteria
- [ ] `document.querySelectorAll('[data-ws-session]')` shows max 1 connection per sessionId
- [ ] Expand → minimize → expand preserves message state (no re-fetch)
- [ ] Stream events received exactly once (no duplicate bubbles)
- [ ] Network tab shows 1 WS per session, not 2–4

## Files Touched
- `packages/web/src/hooks/use-websocket.ts` — refactor to singleton pattern
- `packages/web/src/hooks/use-session.ts` — consume shared WS
- `packages/web/src/components/grid/mini-terminal.tsx` — verify no extra useSession
- `packages/web/src/components/grid/expanded-session.tsx` — verify no extra useSession
- `packages/web/src/components/layout/session-pane.tsx` — verify

## Dependencies
- None — foundational change, must be Phase 1

## Risk
- High impact: touches the core data flow. Must test thoroughly.
- Child session tabs need their own WS — don't accidentally share parent's.
