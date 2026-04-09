# Phase 1: Safety Nets

## Goal
Add error boundaries per panel, validate debate endpoints with Zod, fix rate limiter localhost bypass in Docker.

## Tasks
- [x] T1.1 — Create reusable `<PanelErrorBoundary>` component with fallback UI
  - `packages/web/src/components/ui/panel-error-boundary.tsx` — new
- [x] T1.2 — Wrap each panel with `<PanelErrorBoundary>`
  - `packages/web/src/components/panels/terminal-panel.tsx` — modify
  - `packages/web/src/components/panels/design-preview-panel.tsx` — modify
  - `packages/web/src/components/panels/ai-context-panel.tsx` — modify
  - `packages/web/src/components/panels/browser-preview-panel.tsx` — modify
  - `packages/web/src/components/panels/file-explorer-panel.tsx` — modify
  - `packages/web/src/components/session/message-feed.tsx` — modify (wrap)
- [x] T1.3 — Add Zod validation on debate endpoints
  - `packages/server/src/routes/sessions.ts:917` — debate/participants: validate body with Zod
  - `packages/server/src/routes/sessions.ts:996` — debate/round: validate body + verify session exists
- [x] T1.4 — Fix rate limiter for Docker environment
  - `packages/server/src/middleware/rate-limit.ts:61-63` — check `X-Forwarded-For` header, only bypass if truly local AND no forwarded header
- [x] T1.5 — Verify build passes

## Acceptance Criteria
- [ ] Any panel crash shows fallback UI, rest of app stays functional
- [ ] Malformed JSON on debate endpoints returns 400 with clear error
- [ ] Rate limiter works when accessed via Docker port-forward
- [ ] Build passes, no regressions

## Files Touched
- `packages/web/src/components/ui/panel-error-boundary.tsx` — new
- `packages/web/src/components/panels/*.tsx` — modify (6 files)
- `packages/web/src/components/session/message-feed.tsx` — modify
- `packages/server/src/routes/sessions.ts` — modify
- `packages/server/src/middleware/rate-limit.ts` — modify

## Dependencies
- None — can start immediately
