# Phase 2: HTTP Hooks

## Goal
Expose an HTTP hook endpoint so Claude Code can POST lifecycle events (PreToolUse, PostToolUse, Stop, Notification) to Companion. This enables server-side tool interception, auto-formatting, and richer event tracking beyond stdout NDJSON parsing.

## Tasks
- [x] Task 1 — Shared: Define hook event types (HookEvent, HookResponse, HooksSettings)
- [x] Task 2 — Server: Create POST /api/hooks/:sessionId endpoint (no auth — CLI posts directly)
- [x] Task 3 — Server: Route hook events to active session (broadcast to browser/Telegram)
- [x] Task 4 — Server: Configure CLI launch to inject hooks URL via project settings.local.json
- [x] Task 5 — Web: Show hook events in activity log (tool_use/result entries)
- [x] Task 6 — Verify: Type check passes (0 errors all packages)

## Acceptance Criteria
- [x] Hook endpoint receives PreToolUse/PostToolUse/Stop/Notification events
- [x] Events are broadcast to session subscribers (browser, Telegram)
- [x] PreToolUse returns allow response (extensible for custom rules)
- [x] CLI is auto-configured with hooks pointing to Companion on launch
- [x] Hooks config cleaned up on CLI exit (restore original settings)
- [x] Zero type errors

## Files Touched
- `packages/shared/src/types/hooks.ts` — new (hook event/response/config types)
- `packages/shared/src/types/index.ts` — modified (export hooks)
- `packages/shared/src/types/session.ts` — modified (hook_event browser message)
- `packages/server/src/routes/hooks.ts` — new (hook receiver endpoint)
- `packages/server/src/routes/index.ts` — modified (register hooks route)
- `packages/server/src/services/cli-launcher.ts` — modified (inject hooks config)
- `packages/server/src/services/ws-bridge.ts` — modified (handleHookEvent, getHooksBaseUrl)
- `packages/web/src/hooks/use-session.ts` — modified (hook_event activity log)
