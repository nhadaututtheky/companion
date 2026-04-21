# Phase 1: Multi Account Bug Fix

## Status
**DONE (2026-04-17)** — shipped in commit `<pending>`. Merge + smoke verify before releasing v0.22.0.

## Goal
Fix dedup logic so 1 Claude login = 1 account row, stable across OAuth token refreshes. Migrate existing duplicates to a canonical row per user identity.

## Root Cause
- `credential-manager.ts:55-57` → `fingerprint = sha256(accessToken)[:16]`
- Claude OAuth refreshes accessToken every ~1h. Each refresh writes new `~/.claude/.credentials.json`, triggers `credential-watcher.ts:43-60` (mtime poll 2s)
- `saveAccount` upserts by fingerprint, but new token = new fingerprint = new row
- Result: user logs in once, over time accumulates many ghost rows

## Strategy Chosen
Claude OAuth tokens are **opaque** (`sk-ant-oat01-*` / `sk-ant-ort01-*`), not JWTs — no user-identity claim to extract. RefreshToken is the stable handle because it only rotates on re-authorization, not on hourly access-token refresh. So:
- `identity = sha256(refreshToken)[:16]` → stable dedup key
- Keep `fingerprint` column for backward compatibility (updated on every save so it still reflects the current accessToken)

## Tasks
- [x] Investigate JWT claims in `accessToken` — confirmed opaque tokens (not JWT), strategy = refreshToken hash
- [x] **Task 1.1** — Add `computeIdentity(refreshToken)` helper (sha256 → 16 hex chars)
  - File: `packages/server/src/services/credential-manager.ts`
- [x] **Task 1.2** — Migration `0040_account_identity.sql`: add nullable `identity` column + non-unique index
  - File: `packages/server/src/db/migrations/0040_account_identity.sql` (new)
  - File: `packages/server/src/db/embedded-migrations.ts` — 0040 entry appended
- [x] **Task 1.3** — Runtime dedup: `dedupeAccountsByIdentity()` scans rows, backfills identity from decrypted refreshToken, merges duplicates in one transaction
  - Survivor priority: `isActive` → latest `lastUsedAt` → oldest `createdAt`
  - Sums `totalCostUsd`, retains freshest `lastUsedAt`, reassigns sessions to survivor
  - Idempotent — safe to run on every server startup
- [x] **Task 1.4** — Update `saveAccount` upsert: lookup by `identity` first, fall back to legacy `fingerprint` so existing rows merge in-place on first write after upgrade
  - File: `packages/server/src/services/credential-manager.ts`
- [x] **Task 1.5** — Wire startup runner in `packages/server/src/index.ts` BEFORE `startCredentialWatcher()`
- [x] **Task 1.6** — Write tests (bun test, isolated file) covering:
  - Same user, token refresh → 1 row (not 2) ✅
  - Two different users → 2 rows ✅
  - Legacy row (no identity) merged in-place on next save ✅
  - Backfill without merge (single legacy row) ✅
  - 3 ghost rows → 1 survivor, costs summed ✅
  - Sessions re-pointed to survivor ✅
  - Idempotent (second run no-ops) ✅
  - File: `packages/server/src/tests/credential-manager-dedup.test.ts` (8 tests, all pass)
- [ ] **Task 1.7** — Manual verify: login → wait 2h for OAuth refresh → check `list.length === 1` (deferred to release QA)

## Acceptance Criteria
- [x] `listAccounts()` returns exactly 1 row per unique Claude user after token refreshes
- [x] Migration + startup dedupe collapses N duplicate rows → canonical row + re-pointed sessions
- [x] No regression: rotation, switching, budget tracking still work (tsc clean, unit tests green)
- [x] Test suite for `saveAccount` dedup passes in isolation (8/8 pass)
- [ ] Release note explicitly mentions user impact (write with v0.22.0 changelog)

## Files Touched
- `packages/server/src/services/credential-manager.ts` — computeIdentity + upsert by identity + dedupeAccountsByIdentity
- `packages/server/src/db/schema.ts` — `identity: text()` nullable column on `accounts`
- `packages/server/src/db/migrations/0040_account_identity.sql` — new
- `packages/server/src/db/embedded-migrations.ts` — 0040 entry
- `packages/server/src/index.ts` — startup dedupe before watcher starts
- `packages/server/src/tests/credential-manager-dedup.test.ts` — 8 tests
- `packages/web/src/lib/api/accounts.ts` — mirror `identity` field on `AccountInfo`

## Dependencies
- None — standalone server-side fix

## Review Gate
Before merging Phase 1:
- [x] Type check passes (server + web)
- [x] Dedup test suite green (isolated `bun test` invocation)
- [ ] Fresh Docker image boot: if data/ already has duplicates → log line `Account dedupe completed merged=N`
- [ ] Restart server after OAuth refresh hits on disk → still only 1 row in `accounts` table

## Estimated Effort
1-2 days (actual: ~0.5 day — JWT investigation ruled out early, refreshToken hash is the right primitive)
