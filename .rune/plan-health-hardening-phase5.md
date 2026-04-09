# Phase 5: Security Hardening

## Goal
Close all security gaps: Zod on every route, auth defaults, iframe policy, Docker-aware rate limiting.

## Tasks
- [ ] T5.1 — Audit all route handlers for missing Zod validation
  - Scan `packages/server/src/routes/*.ts` for `c.req.json<...>()` without Zod
  - Add Zod schemas for every POST/PUT/PATCH body
  - `packages/server/src/routes/sessions.ts` — modify (debate endpoints + any others found)
  - `packages/server/src/routes/channels.ts` — modify
  - `packages/server/src/routes/settings.ts` — verify
  - `packages/server/src/routes/wiki.ts` — verify

- [ ] T5.2 — Session existence check on all session-scoped endpoints
  - All `/:id/*` routes must verify session exists before processing
  - Return 404 with clear error if session not found
  - `packages/server/src/routes/sessions.ts` — modify

- [ ] T5.3 — Strengthen auth defaults
  - `packages/server/src/middleware/auth.ts` — if no PIN and no API_KEY configured, log WARNING at startup
  - Add `COMPANION_REQUIRE_AUTH=true` env var option to force auth even in Docker
  - Document in README/CLAUDE.md

- [ ] T5.4 — Review iframe sandbox policy
  - `packages/web/src/components/panels/design-preview-panel.tsx` — add toggle: "Safe Mode" (sandbox="") vs "Interactive Mode" (sandbox="allow-scripts allow-forms")
  - Default to Safe Mode, user opts into Interactive

- [ ] T5.5 — Remove console.error/console.log from production web code
  - Scan `packages/web/src/` for `console.error`, `console.log`
  - Replace with error boundary catch or toast notification
  - `packages/web/src/components/session/session-details.tsx:593` — known instance

- [ ] T5.6 — Verify build + security scan

## Acceptance Criteria
- [ ] Every POST/PUT route validates body with Zod
- [ ] Every session-scoped route checks session existence
- [ ] Auth warning logged when no credentials configured
- [ ] Design preview defaults to safe sandbox
- [ ] No console.log/error in production web code
- [ ] Build passes

## Files Touched
- `packages/server/src/routes/*.ts` — modify (all route files)
- `packages/server/src/middleware/auth.ts` — modify
- `packages/web/src/components/panels/design-preview-panel.tsx` — modify
- `packages/web/src/components/session/session-details.tsx` — modify

## Dependencies
- Phase 1 complete (rate limiter already fixed there)
