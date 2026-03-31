# Phase 4: Core Feature Gaps

## Goal

Fill the most impactful missing features that affect both Telegram and Web interfaces. Focus on reliability and user retention.

## Tasks

### First-Run Onboarding
- [ ] Server: add `GET /api/setup-status` endpoint — returns { hasApiKey, hasProjects, hasSessions, claudeCliInstalled }
  - `packages/server/src/routes/index.ts` — new route
- [ ] Web: onboarding wizard component — shown when setup-status incomplete
  - Step 1: Enter API key (if missing)
  - Step 2: Configure project directory (show Docker mount instructions or native path)
  - Step 3: Create first session
  - `packages/web/src/components/onboarding-wizard.tsx` — new
- [ ] Telegram: enhance `/start` to detect first-time user and guide setup
  - Check if any projects exist → if not, show inline setup guide

### Message Persistence (Web)
- [ ] Server: add `GET /api/sessions/:id/messages` endpoint — fetch from `session_messages` table
  - Pagination: `?limit=50&before=<messageId>`
  - `packages/server/src/routes/sessions.ts` — new route
- [ ] Web: on WebSocket connect, if `message_history` is empty, fetch from REST API
  - `packages/web/src/hooks/use-session.ts` — add REST fallback
- [ ] Ensure messages survive server restart

### Session Export
- [ ] Server: add `GET /api/sessions/:id/export` endpoint
  - Format: markdown (default), JSON
  - Include: session metadata, all messages, cost summary
  - `packages/server/src/routes/sessions.ts` — new route
- [ ] Telegram: add `/export` command — sends markdown file to chat
  - `packages/server/src/telegram/commands/session.ts` — new handler
- [ ] Web: add "Export" button in session header
  - Download as .md file

### Budget Enforcement
- [ ] Server: check cost against `cost_budget_usd` before sending message to CLI
  - If exceeded: block message, notify user "Budget exceeded ($X/$Y). Increase budget or start new session."
  - `packages/server/src/services/ws-bridge.ts` — add budget gate
- [ ] Telegram: show budget warning at 80% and block at 100%
- [ ] Web: show budget progress bar in session header

### Session Labels/Tags (Web)
- [ ] Add `tags` field to sessions table (JSON array)
  - `packages/server/src/db/schema.ts` — migration
- [ ] Web: tag editor in session card — click to add/remove tags
- [ ] Web: filter sessions by tag

## Acceptance Criteria

- [ ] First-time user sees onboarding wizard (Web) or setup guide (Telegram)
- [ ] Web messages persist across server restart
- [ ] User can export session as markdown (both Telegram and Web)
- [ ] Session blocks messages when budget exceeded
- [ ] Sessions can be tagged and filtered

## Files Touched

- `packages/server/src/routes/index.ts` — setup-status endpoint
- `packages/server/src/routes/sessions.ts` — messages, export endpoints
- `packages/server/src/services/ws-bridge.ts` — budget enforcement
- `packages/server/src/db/schema.ts` — tags field
- `packages/server/src/telegram/commands/session.ts` — /export
- `packages/server/src/telegram/telegram-bridge.ts` — onboarding
- `packages/web/src/components/onboarding-wizard.tsx` — new
- `packages/web/src/hooks/use-session.ts` — message persistence
- `packages/web/src/app/page.tsx` — onboarding integration, tags UI

## Dependencies

- Phase 1 completed (version + bug fixes)
- Phase 3 auth flow (login page exists for onboarding to redirect to)

## Review Gate

- [ ] `bun run build` passes
- [ ] Manual test: fresh install → onboarding wizard appears
- [ ] Manual test: restart server → web messages still visible
- [ ] Manual test: `/export` in Telegram → receives .md file
- [ ] Manual test: exceed budget → session blocks with clear message
