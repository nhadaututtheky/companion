# Phase 5: Security Hardening

## Goal
Close all security gaps: Zod on every route, auth defaults, iframe policy, Docker-aware rate limiting.

## Tasks

### T5.1 — Zod validation on all POST/PUT routes ✅
- [x] `codegraph.ts` — 5 POST + 1 PUT: added schemas (projectSlugSchema, rescanSchema, configSchema)
- [x] `webintel.ts` — 6 POST: added schemas (scrapeSchema, docsSchema, searchSchema, researchSchema, crawlSchema, startWebclawSchema)
- [x] `sessions.ts` — POST /:id/resume: added resumeSchema
- [x] `models.ts` — POST /providers/:id/toggle: added toggleSchema
- [x] `hooks.ts` — Skipped: already secured via timing-safe auth + type Set validation

### T5.2 — Session existence checks ✅
- [x] Audited all 30+ session-scoped endpoints in sessions.ts
- [x] All write endpoints properly check `bridge.getSession()` or `getSessionRecord()` and return 404
- [x] Only `DELETE /:id` skips check — `killSession` is idempotent, safe by design

### T5.3 — Auth defaults ✅
- [x] Added `warnIfNoAuth()` to `middleware/auth.ts`
- [x] Called at server startup in `index.ts`
- [x] Logs WARNING with remediation steps when no PIN or API_KEY configured

### T5.4 — Iframe sandbox safe mode ✅
- [x] Added `safeMode` state (default: true) to DesignPreviewPanel
- [x] Safe mode: `sandbox=""` (no scripts, no forms)
- [x] Interactive mode: `sandbox="allow-scripts allow-forms"` (user opt-in)
- [x] Toggle button with ShieldCheck/ShieldSlash icons + color feedback

### T5.5 — Remove console.log/error ✅
- [x] Scanned `packages/web/src/` — only 1 instance found
- [x] Removed `console.error` in session-details.tsx:593 (snapshot loading)

### T5.6 — Verify build ✅
- [x] `bunx tsc --noEmit` passes clean for both server and web packages

## Acceptance Criteria
- [x] Every POST/PUT route validates body with Zod
- [x] Every session-scoped route checks session existence
- [x] Auth warning logged when no credentials configured
- [x] Design preview defaults to safe sandbox
- [x] No console.log/error in production web code
- [x] Build passes

## Files Touched
- `packages/server/src/routes/*.ts` — modify (all route files)
- `packages/server/src/middleware/auth.ts` — modify
- `packages/web/src/components/panels/design-preview-panel.tsx` — modify
- `packages/web/src/components/session/session-details.tsx` — modify

## Dependencies
- Phase 1 complete (rate limiter already fixed there)
