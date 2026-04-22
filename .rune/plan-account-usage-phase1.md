# Phase 1: Fetcher + Schema — ✅ DONE (2026-04-22)

## Goal

Build a best-effort `usage-fetcher.ts` (mirroring `profile-fetcher.ts`), an `oauth-token-service.ts` with per-account refresh mutex, a migration adding quota columns, and a full test suite. No UI yet — the server persists data that Phase 2 consumes.

## Tasks

### 1.1 Schema migration — `0048_account_quota.sql` (renumbered from 0043; last applied = 0047)
- [x] New columns on `accounts` table (all nullable):
  - `quota_five_hour_util REAL` (0..1)
  - `quota_five_hour_resets_at INTEGER` (unix seconds, Anthropic-reported)
  - `quota_seven_day_util REAL`
  - `quota_seven_day_resets_at INTEGER`
  - `quota_seven_day_opus_util REAL`, `quota_seven_day_opus_resets_at INTEGER`
  - `quota_seven_day_sonnet_util REAL`, `quota_seven_day_sonnet_resets_at INTEGER`
  - `quota_overage_status TEXT` (nullable enum: allowed/allowed_warning/rejected)
  - `quota_fetched_at INTEGER` (unix ms, last successful fetch)
- [x] Update `embedded-migrations.ts` (INV-enforced)
- [x] Update `db/schema.ts` Drizzle definitions

### 1.2 `oauth-token-service.ts` (new, ~200 LOC)
- [x] `getAccessToken(accountId): Promise<string | null>` — reads DB, checks `expiresAt`, refreshes if within 60s of expiry, returns fresh token
- [x] Per-account `Map<accountId, Promise>` mutex → concurrent calls wait on same refresh
- [x] `refreshAccessToken(accountId)`:
  - POST `https://console.anthropic.com/v1/oauth/token`
  - Form body: `grant_type=refresh_token&refresh_token=<rt>&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e` (verify client_id from binary)
  - Headers: `Content-Type: application/x-www-form-urlencoded`, `anthropic-beta: oauth-2025-04-20`
  - On success: decrypt old blob, merge new `access_token`/`refresh_token`/`expires_in`, re-encrypt, write atomically
  - On 400 `invalid_refresh_token`: set `status='expired'` + broadcast `account:expired` event
  - SSRF defense: `redirect: "error"`
- [x] Observability: log latency + outcome per call (success/refresh/401/network)

### 1.3 `usage-fetcher.ts` (new, ~180 LOC, template = `profile-fetcher.ts`)
- [x] `fetchAccountUsage(accessToken): Promise<UsageResponse | null>` — never throws
  - GET `https://api.anthropic.com/api/oauth/usage`
  - Headers: Bearer + `anthropic-version: 2023-06-01` + `anthropic-beta: oauth-2025-04-20`
  - `redirect: "error"`, 5s timeout
- [x] Zod schema with all fields `.optional()` — survive shape drift
- [x] `refreshAccountUsage(accountId, { force })`:
  - Get token via `oauth-token-service`
  - 401 → single retry after forced refresh (handles cross-machine rotation)
  - Persist to new columns + `quota_fetched_at = Date.now()`
- [x] TTL = 60s (don't re-fetch if last call < 60s ago unless `force`)
- [x] Skip if `status IN ('expired', 'error')` or `skipInRotation=true`

### 1.4 Tests — `usage-fetcher.test.ts` + `oauth-token-service.test.ts`
- [x] Mock `fetch` with 2xx happy path → persisted correctly
- [x] 401 on first call → refresh triggered → retry succeeds
- [x] 401 twice in a row → account marked expired
- [x] Shape drift (missing `five_hour` field) → fallback to null, no crash
- [x] Concurrent `getAccessToken` x5 → one network refresh, all resolve same token
- [x] TTL respect: second call within 60s returns early without network
- [x] Skipped account (`skipInRotation=true`) → no network call

## Acceptance Criteria

- [x] `bun test packages/server/src/services/usage-fetcher.test.ts` green
- [x] `bun test packages/server/src/services/oauth-token-service.test.ts` green (may need separate invocation per `bun-mock` isolation memory)
- [x] Migration runs cleanly on fresh DB + on existing DB with accounts
- [x] `grep -rn "decrypt(" packages/server/src/services/` shows no new callers outside `oauth-token-service.ts` (enforce routing)

## Files Touched

- `packages/server/src/db/migrations/0048_account_quota.sql` — new (0043 in draft; renumbered to match last-applied 0047)
- `packages/server/src/db/embedded-migrations.ts` — append 0048 entry
- `packages/server/src/db/schema.ts` — add 10 quota columns on `accounts`
- `packages/server/src/services/oauth-token-service.ts` — new (211 LOC)
- `packages/server/src/services/usage-fetcher.ts` — new (215 LOC)
- `packages/server/src/services/event-bus.ts` — add `account:expired` event
- `packages/server/src/tests/oauth-token-service.test.ts` — new (6 tests, all green)
- `packages/server/src/tests/usage-fetcher.test.ts` — new (8 tests, all green)
- `packages/shared/src/types/account.ts` — new (`AccountQuota` + `maxQuotaUtil` helper + `QUOTA_*` constants)
- `packages/shared/src/types/index.ts` — export

## Dependencies

- [x] Confirm OAuth `client_id` by one more binary grep — **confirmed** `9d1c250a-e61b-44d9-88ed-5944d1962f5e` present in `@anthropic-ai/claude-code` v2.1.116 binary (endpoints `/api/oauth/usage`, `/v1/oauth/token`, `/v1/oauth/hello` also confirmed)
- [x] Existing `crypto.ts` for encrypt/decrypt reuse — oauth-token-service is the only NEW decrypt caller

## Risks

- **Anthropic changes client_id**: binary may update. Mitigation: log mismatch on 400, surface in feedback panel for user self-report.
- **`expires_in` rounding**: server returns seconds; we store ms. Off-by-1s boundary not a real problem (60s safety window).
- **Token leak via error object**: never pass `creds.accessToken` into logger, only booleans. ✓ Verified across oauth-token-service + usage-fetcher.
- **Pre-existing flakiness**: full `bun test` suite reports 93 pre-existing failures from bun mock.module cross-file leakage (`feedback_bun_mock_isolation.md`). Tests pass 100% when files are run in isolation. Phase 1 tests run clean alongside credential-manager-dedup (42/42).

## Verification Evidence

- `bun test src/tests/oauth-token-service.test.ts` → 6 pass / 0 fail (203 ms)
- `bun test src/tests/usage-fetcher.test.ts` → 8 pass / 0 fail (156 ms)
- `bun run --cwd packages/server check` → clean
- `bun run --cwd packages/shared check` → clean
- `grep -n "decrypt(" packages/server/src/services/` → only existing (credential-manager, profile-fetcher) + new oauth-token-service; no rogue callers.
