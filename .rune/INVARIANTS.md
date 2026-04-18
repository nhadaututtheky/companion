# Companion — Cross-Feature Invariants

> **Mandatory reading before editing**: `packages/server/src/services/ws-*`, `packages/server/src/telegram/**`, `packages/server/src/services/session-store.ts`, `packages/server/src/services/compact-manager.ts`, or anything that mutates session state.

These are contracts between modules that compilers won't catch. Break them and you'll ship a bug that passes tests but fails in production. Each rule includes WHY (real incident or design reason) so you can judge edge cases.

---

## Session Lifecycle

### INV-1: Session-ending paths MUST clear BOTH `sessions.cliSessionId` AND `telegramSessionMappings.cliSessionId`
**Why**: Two tables hold `cliSessionId` independently — sessions table (persisted by `endSessionRecord`) and telegramSessionMappings (persisted by explicit update). Clearing only one leaves the other pointing to a dead CLI process; `/resume` then tries to attach to nothing.
**Where**: `ws-session-lifecycle.killSession`, `telegram-idle-manager` kill timer, `telegram` /stop command.
**Check**: grep your diff for `cliSessionId` — for every set/clear on one table, verify the other is covered.

### INV-2: Session-ending paths MUST clear `shortId`
**Why**: shortId is a short numeric alias (e.g. `s7`). If not cleared, next session might collide.
**Where**: `session-store.endSessionRecord` sets `shortId: null`. All kill paths go through this.
**Check**: Any new kill path MUST call `endSessionRecord` (never update sessions table directly to set status=ended).

### INV-3: Resume MUST inherit user-configured settings from DB, not use DEFAULT
**Why**: Users set custom timeouts/compact thresholds. Resume creates a new session row but settings are per-mapping (telegramSessionMappings) or per-sessions row. Reading DEFAULT drops user config silently.
**Where**: `telegram-idle-manager.getSessionConfig` reads `telegramSessionMappings.idleTimeoutMs`. Compact threshold flows via `session.state.compact_threshold`.
**Check**: When adding a new per-session setting, add DB column AND read it on resume AND read it on `getSessionConfig` fresh-fetch.

### INV-4: Account row merge/delete MUST check sessions for non-terminal status
**Why**: If an account has an active session, deleting the row orphans encrypted state.
**Where**: `session-store.ts` — merge/delete paths.
**Check**: Before touching account rows, query `sessions` WHERE `account_id=? AND status NOT IN ('ended','error')`.

---

## Compact Flow

### INV-5: Compact threshold is `session.state.compact_threshold` (default 75), NEVER hardcoded
**Why**: User configures this per-session in settings. Hardcoded 80% in telegram warnings shipped and silently ignored user config for weeks.
**Where**: `telegram-session-events.handleContextUpdate`, any pulse warning.
**Check**: grep `>= 80` or `>= 75` numeric thresholds in context-related code — they should read from session state.

### INV-6: `compactWarningSent` set MUST be cleared when compact completes
**Why**: Otherwise second compact cycle of the same session never warns.
**Where**: `telegram-session-router.ts` case `status_change: "idle"` (post-compact transition).
**Check**: Any new warning-deduplication set needs a reset point tied to the state transition that makes it relevant again.

### INV-7: `compact_handoff` broadcasts MUST reach all channels (Web + Telegram)
**Why**: Compact-manager broadcasts via `broadcastToAll`. Router needs to switch on this type. Telegram had a gap (bug fixed 2026-04-19) where `compact_handoff` was a valid `BrowserIncomingMessage` variant but router had no case → user never saw compact progress.
**Where**: `telegram-session-router.ts` switch + any other consumer.
**Check**: When adding a new `BrowserIncomingMessage` variant, grep `switch (msg.type)` across telegram AND web — every switch must have a case (or explicit `default` that handles it).

---

## Message Routing / State Machines

### INV-8: `switch (msg.type)` over `BrowserIncomingMessage` MUST be exhaustive
**Why**: TypeScript won't warn when you add a new variant and forget handlers. Typed as `never`-assert default prevents silent drops.
**How**: Add `default: const _exhaustive: never = msg; void _exhaustive;` to every switch over union types that represent events.
**Where**: telegram-session-router, ws-message-handler, web client.

### INV-9: SessionStatus transitions MUST respect `VALID_TRANSITIONS` in shared/types/session.ts
**Why**: Invalid transition (e.g. `ended` → `busy`) corrupts session state machine.
**Where**: `updateStatus` in ws-bridge; anywhere that writes `session.state.status` directly.
**Check**: Prefer `bridge.updateStatus(session, status)` over direct assignment.

---

## Dual-Path Code (WS ↔ Telegram ↔ SDK)

### INV-10: A "session lifecycle event" exists in 3 places — WS, Telegram, SDK. Fix in ONE = regression in other two
**Why**: idle kill exists in `ws-health-idle.ts` and `telegram-idle-manager.ts`. Session start exists in `ws-session-lifecycle` (non-SDK) and `startSessionWithSdk` (SDK). Bugs fixed in one path often regress in the other.
**Check**: When touching lifecycle, grep: `killSession`, `endSessionRecord`, `startIdleTimer`, `clearIdleTimer`, `status === "ended"` across both `packages/server/src/services/**` AND `packages/server/src/telegram/**`.

### INV-11: SessionSettings state lives in 3 places — DB, in-memory Map, React. ONE writer per place
**Why**: `idleTimeoutMs` has `telegramSessionMappings` (DB), `TelegramIdleManager.sessionConfigs` (Map), `ws-bridge.SessionSettings` (separate Map). Writes must go through persistIdleTimeout → cache invalidation, never direct Map.set bypassing DB.
**Rule**: Writes to settings go through the persist API. Reads hit memory cache first, DB on miss.

---

## AI Provider

### INV-12: Every AI provider config field MUST have a corresponding disable path
**Why**: Users who save a bad provider config had no way to revert without manually clearing each field. Shipped 2026-04-19.
**Where**: `settings-tab-ai.tsx` Disable button, any new AI config UI.
**Check**: If you add `ai.<newKey>` setting, add it to the `keys` array in `handleDisable` too.

---

## Review Checklist

Before submitting a PR that touches session lifecycle, telegram, or compact:

- [ ] Touch `cliSessionId`? → grep both `sessions` AND `telegramSessionMappings` updates
- [ ] Touch `shortId`? → verify only `endSessionRecord` clears it
- [ ] Add new `BrowserIncomingMessage` variant? → grep every `switch (msg.type)` across server + web
- [ ] Hardcode a percentage threshold? → read from `session.state.compact_threshold` instead
- [ ] Change compact flow? → verify `compactWarningSent.delete` fires post-compact
- [ ] Edit `ws-session-lifecycle.ts`? → check if `startSessionWithSdk` path needs the same edit
- [ ] Edit idle kill logic? → check BOTH `ws-health-idle.ts` AND `telegram-idle-manager.ts`
- [ ] Add new AI provider setting? → extend `handleDisable` keys list

---

## Appendix: Known Historic Violations (for learning)

1. **Resume dropped custom idleTimeoutMs** (fixed 2026-04-19) — `getSessionConfig` used hardcoded 3_600_000 instead of reading from telegramSessionMappings.
2. **Telegram never announced compact start** (fixed 2026-04-19) — router had no case for `status_change: "compacting"` or `compact_handoff` type.
3. **Context warning fixed at 80%** (fixed 2026-04-19) — ignored user-configured `compact_threshold`.
4. **AI Provider had no disable path** (fixed 2026-04-19) — user could save but not revert.
