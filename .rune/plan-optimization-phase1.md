# Phase 1: Security Hardening

## Goal
Fix all CRITICAL and HIGH security vulnerabilities. This phase MUST complete before any other work.

## Tasks
- [ ] **S01** — Add HMAC auth to hook endpoint — `routes/hooks.ts`
  - Generate per-session hook secret, pass to CLI via env var
  - Verify HMAC signature on incoming hook requests
  - Reject requests without valid signature
- [ ] **S02** — Add path validation to database browser — `routes/database.ts`, `services/db-browser.ts`
  - Apply `ALLOWED_BROWSE_ROOTS` check (same pattern as `routes/filesystem.ts`)
  - Reject connectionString pointing outside allowed roots
- [ ] **S03** — Add path validation to terminal spawn — `routes/terminal.ts`
  - Validate `cwd` against `ALLOWED_BROWSE_ROOTS`
  - Return 403 for paths outside allowed roots
- [ ] **S04** — Enable Tauri CSP — `src-tauri/tauri.conf.json`
  - Set proper CSP: `default-src 'self'; connect-src 'self' http://localhost:3579 ws://localhost:3579; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`
  - Set `dangerousDisableAssetCspModification: false`
  - Set `freezePrototype: true`
- [ ] **S05** — Remove `--hot` from Docker production — `docker-entrypoint.sh`
  - Replace `bun run --hot` with `bun run` for production
  - Keep `--hot` only when `NODE_ENV=development`
- [ ] **S06** — Restrict Tauri shell capabilities — `src-tauri/capabilities/default.json`
  - Replace `shell:allow-execute` with scoped sidecar-only permission
- [ ] **S07** — Add Telegram bot default deny — `telegram/bot-factory.ts`
  - When allowedChatIds/adminUserIds are empty, only allow the bot creator
  - Log warning on startup if whitelist is empty
- [ ] **S08** — Add global Hono error handler — `index.ts`
  - `app.onError()` with structured logging, sanitized response (no stack traces)

## Acceptance Criteria
- [ ] Hook endpoint rejects requests without valid HMAC
- [ ] DB browser rejects paths outside project dirs
- [ ] Terminal spawn rejects cwd outside project dirs
- [ ] Tauri app has CSP enabled
- [ ] Docker production doesn't use --hot
- [ ] Telegram bot rejects messages from unknown users when no whitelist
- [ ] All existing tests pass

## Files Touched
- `packages/server/src/routes/hooks.ts` — modify
- `packages/server/src/routes/database.ts` — modify
- `packages/server/src/services/db-browser.ts` — modify
- `packages/server/src/routes/terminal.ts` — modify
- `packages/server/src/index.ts` — modify
- `packages/server/src/telegram/bot-factory.ts` — modify
- `src-tauri/tauri.conf.json` — modify
- `src-tauri/capabilities/default.json` — modify
- `docker-entrypoint.sh` — modify
