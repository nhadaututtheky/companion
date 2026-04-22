# Companion — Core Rules (never break)

> These are the most violated invariants. Each one has already shipped as a bug at least once. When your change touches any of these areas, re-read the relevant rule.

## Session lifecycle (INV-1 to INV-4)

**Every session-ending path MUST clear both `sessions.cliSessionId` AND `telegramSessionMappings.cliSessionId`.** Two tables hold the cliSessionId independently. Clearing one leaves the other pointing to a dead CLI process, so `/resume` attaches to nothing. Check: grep your diff for `cliSessionId`; for every set/clear on one table, verify the other is covered.

**Every session-ending path MUST clear `shortId`.** `endSessionRecord` sets `shortId: null`. All kill paths go through it. Never write `sessions.status = 'ended'` via direct UPDATE.

**Resume MUST inherit user-configured settings from the DB, not DEFAULT.** `telegram-idle-manager.getSessionConfig` reads `telegramSessionMappings.idleTimeoutMs`; compact threshold flows via `session.state.compact_threshold`. A resume that falls back to DEFAULT silently drops a user's custom timeout.

**Account row merge/delete MUST check sessions for non-terminal status first.** Before touching account rows: `sessions WHERE account_id=? AND status NOT IN ('ended','error')`. Orphaning encrypted state leaves dead sessions nobody can clean up.

## Compact flow (INV-5 to INV-7)

**Compact threshold is `session.state.compact_threshold` (default 75), never hardcoded.** `>= 80` in context code silently ignores user settings. That regression shipped and stayed hidden for weeks.

**The `compactWarningSent` set MUST be cleared when compact completes.** Reset in `telegram-session-router.ts` at `status_change: "idle"` post-compact. Otherwise the second compact cycle never warns.

**`compact_handoff` broadcasts MUST reach every channel (Web + Telegram).** When you add a new `BrowserIncomingMessage` variant, grep `switch (msg.type)` across server + web — every switch must have a case or explicit `default`.

## Dual-path code (INV-10, INV-11)

**Session lifecycle exists in 3 places — WS, Telegram, SDK. Fix in one = regression in the other two.** When touching lifecycle, grep: `killSession`, `endSessionRecord`, `startIdleTimer`, `clearIdleTimer`, `status === "ended"` across `services/**` AND `telegram/**` AND `sdk-engine.ts`.

**SessionSettings state lives in 3 places — DB, in-memory Map, React. ONE writer per place.** Writes go through `persistIdleTimeout` / `SessionSettingsService.update()` → cache invalidation, never direct `Map.set` bypassing DB.

## Session settings unification (INV-13 to INV-15)

**All session-settings reads go through `SessionSettingsService.get()`.** Pre-unification each consumer read from a different place, silently stale on one path while others stayed fresh — root cause of the recurring "timeout resets on resume" bug.

**All session-settings writes go through `SessionSettingsService.update()`.** Any `Map.set()` or direct `UPDATE sessions SET` bypasses the event bus. Grep `.sessionSettings.set(` / `.sessionConfigs.set(` outside the service; only read-only subscriber code is legitimate.

**Every new per-session setting needs: DB column + type field + default constant + contract test.** Four sites in `packages/shared/src/constants.ts`, `packages/shared/src/types/session.ts`, `packages/server/src/db/schema.ts`, `packages/server/src/services/__tests__/settings-resume-inheritance.test.ts`. PR cannot land if any is missing.

## AI provider (INV-12)

**Every AI provider config field MUST have a corresponding disable path.** When you add `ai.<newKey>` setting, add it to the `keys` array in `handleDisable` (settings-tab-ai.tsx) too. Otherwise users who save a bad config can't revert.

## Cross-cutting

- **No hardcoded secrets.** Use environment variables. Never commit keys, tokens, OAuth refresh tokens.
- **TypeScript strict.** No `any`, full type coverage, especially at module boundaries.
- **Semantic commits.** `feat:`, `fix:`, `refactor:`, `chore:`. The `/ship` skill enforces this.
- **Wiki is your notebook.** Save discoveries via `companion_wiki_note` — non-obvious patterns, root causes, hidden constraints. Future sessions benefit.

## Before submitting a PR

Review checklist when you touch session lifecycle, telegram, or compact:

- Touch `cliSessionId`? grep both `sessions` AND `telegramSessionMappings` updates
- Touch `shortId`? verify only `endSessionRecord` clears it
- Add new `BrowserIncomingMessage` variant? grep every `switch (msg.type)`
- Hardcode a percentage threshold? read from `session.state.compact_threshold`
- Edit idle kill logic? check BOTH `ws-health-idle.ts` AND `telegram-idle-manager.ts`
- Add new AI provider setting? extend `handleDisable` keys list
- Add new per-session setting? four-site checklist (INV-15)
- Touch session-settings read/write? route through `SessionSettingsService` (INV-13/14)
