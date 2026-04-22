# Phase 2: Round-Robin Fix + Inline Quota Bars (MVP)

> **Status:** 2A (server) done 2026-04-22. 2B (web UI) pending.

## Goal

Two wins in one phase:

**(a) Correctness fix**: `findNextReady()` gates on real Anthropic quota → round-robin skips accounts near their limit **before** sending a request (proactive), not after a failed request (reactive).

**(b) UI honesty**: Each account row in Settings > Account shows real quota bars (from `/api/oauth/usage`) inline. Existing cost panel relabeled to clarify it's local-only.

Ship gate: if both work well for 1 week, mark feature done. Phase 3 (background poller) only if users need quota warnings without opening Settings.

## Tasks

### 2.1 Round-robin proactive gate — `credential-manager.ts` ✅
- [x] Split `findNextReady` into sync + async variants:
  - `findNextReady(excludeId?, includeSkipped?)` — keep existing sync behavior as fallback
  - `findNextReadyAsync(excludeId?, includeSkipped?)` — new: refreshes stale quotas JIT, then applies quota gate
- [ ] Quota gate logic:
  - Read `accounts.switchThreshold` setting, default `0.9`
  - Compute `maxUtil = max(quota_five_hour_util, quota_seven_day_util, quota_seven_day_opus_util, quota_seven_day_sonnet_util)` — null values treated as 0
  - Exclude rows where `maxUtil >= switchThreshold`
  - If ALL eligible accounts are over threshold → fall back to "pick minimum maxUtil" (least-over-limit)
  - If quota data is stale (`quota_fetched_at` null or > 5m old) → skip gate for that row (don't block on missing data)
- [ ] JIT refresh:
  - New helper `refreshStaleQuotas(maxAgeMs: number)` in `usage-fetcher.ts`
  - Filter `ready` accounts with `fetched_at > maxAgeMs` → parallel refresh, concurrency cap 3, 2s timeout each
  - Called from `findNextReadyAsync` before the pick
- [ ] Callers updated: `session-start` / `account-auto-switch.handleRateLimited` → use async variant

### 2.2 Keep reactive fallback alive ✅
- [x] `account-auto-switch.ts` regex → event path UNCHANGED. Proactive gate is a layer on top, not a replacement.
- [x] When reactive swap triggers after a failed request, log a "proactive miss" warning — signals quota data was stale. Helps tune TTL.

### 2.3 Settings: `accounts.warnThreshold` + `accounts.switchThreshold` ✅ (server)
- [x] Two new rows in `app_settings` key-value table (stored via existing `settings` table convention)
- [x] Defaults: `warnThreshold=0.7`, `switchThreshold=0.9`
- [x] Slider step: `0.05` (display as 5% increments — 50%, 55%, ..., 95%)
- [x] Expose in `settings-helpers.getSettingNumber(key, default)`
- [x] Server validation on `PATCH /api/accounts/settings`:
  - [x] Clamp each to `[0.5, 0.95]`
  - [x] Snap to nearest 0.05 multiple
  - [x] Enforce `warnThreshold + 0.05 <= switchThreshold` (with fence fallback for MIN/MAX corners)
  - [x] Return normalized values so client can reflect server's final state
- [ ] Web UI — in `accounts-tab.tsx` settings section (near auto-switch toggle):
  - Two sliders stacked: "Warning at %" and "Auto-switch at %"
  - Warn slider range: `[0.5, switchThreshold - 0.05]`, step `0.05`
  - Switch slider range: `[warnThreshold + 0.05, 0.95]`, step `0.05`
  - Display as percentage (70% / 90%), stored as 0..1 float
  - Labels explain each: "Highlight bar when quota reaches X%" / "Skip account in rotation when quota reaches X%"
  - Disabled if `autoSwitchEnabled=false` (greyed, with tooltip)

### 2.4 REST extension — `routes/accounts.ts` ✅
- [x] `GET /api/accounts` list response now includes `quota` field per account (via `toAccountInfo`)
- [x] `POST /api/accounts/:id/quota/refresh` — force-fetch; rate-limited 1 call / 10s / account (429 + Retry-After)

### 2.5 Shared types — `packages/shared/src/types/account.ts` ✅
- [x] `AccountQuota` interface (already defined in Phase 1)
- [x] Extend `AccountInfo` in server's `credential-manager.ts` with `quota: AccountQuota | null`

### 2.6 Web UI — inline bars in card
- [ ] Extract `AccountQuotaBars` component (~70 LOC, presentational)
  - File: `packages/web/src/components/settings/account-quota-bars.tsx`
  - Props: `{ quota?: AccountQuota, tier: string | null, warnThreshold: number, switchThreshold: number, onRefresh: () => void, refreshing: boolean }`
  - 2 bars (Pro/Max) or 3 bars (Team/Enterprise — Opus/Sonnet split)
  - Each bar shows individual window utilization (so user sees which one is the bottleneck)
  - Color mapping driven by props: `< warnThreshold` green, `warn..switch` yellow, `>= switch` red — applied per bar
  - Small marker tick at `warnThreshold` position on each bar (visual cue of user's warn line)
  - Badge "near limit" in card header when `maxUtil >= warnThreshold` (account-level, not per-bar)
  - "updated Xm ago" + refresh icon
  - Skeleton when `quota === undefined`
  - ≤ 36px vertical
  - `aria-valuenow/valuemin/valuemax` on each bar
- [ ] Mount inside existing row render block in `accounts-tab.tsx` (~line 300, after label/status, before action buttons)

### 2.7 Auto-fetch on tab visible
- [ ] In `AccountsTab`, `document.visibilityState === 'visible'` + any row's `quota.fetchedAt > 5m` → stagger refresh (500ms apart, stale rows only)
- [ ] Debounce visibility flicker <1s

### 2.8 Relabel existing cost panel
- [ ] In `account-usage-panel.tsx`, add a banner at top: "This device's activity only — see quota bars above for Anthropic-reported limits"
- [ ] Rename section title from "5h session" → "5h (this device)"; "weekly" → "weekly (this device)"
- [ ] No data-source change — still computes from local sessions. Just truth-in-labeling.

### 2.9 Tests (server slice ✅)
- [x] `find-next-ready-async.test.ts` — 8 scenarios (quota-gated round-robin)
- [x] `refresh-stale-quotas.test.ts` — 6 scenarios (concurrency, TTL, skip rules)
- [x] `account-thresholds.test.ts` — 9 scenarios (clamp/snap/min-gap fence fallback)

- [ ] (web slice) `credential-manager.findNextReadyAsync.test.ts`:
  - Account with 5h=95%, weekly=20% (maxUtil=0.95 > 0.9) → excluded
  - Account with 5h=20%, weekly=92% (maxUtil=0.92) → also excluded (MAX covers weekly)
  - All accounts over threshold → min-maxUtil picked
  - Stale quota → not excluded, flagged in log
  - JIT refresh called exactly once per stale row
  - Custom switchThreshold 0.95 → account with maxUtil=0.92 NOT excluded
  - Null quota fields (new account) → maxUtil=0, not excluded
- [ ] `usage-fetcher.refreshStaleQuotas.test.ts` — concurrency cap, timeout handling
- [ ] `account-quota-bars.test.tsx` — color mapping with custom thresholds, warn marker position, skeleton, onRefresh
- [ ] `routes/accounts.settings.test.ts` — threshold validation (min gap, bounds, auto-bump)
- [ ] Manual E2E: 2 accounts, mock 1 at 92% → round-robin picks the other at default threshold; set switchThreshold=0.95 → picks the 92% one

## Acceptance Criteria

- [ ] Round-robin skips account at 92% util before hitting hard limit (zero-failed-request rotation)
- [ ] If quota data missing/stale, reactive regex path still catches rate limits (no regression)
- [ ] User opens Settings > Account → inline bars show 5h + weekly % per account
- [ ] Cost panel clearly labeled "this device only"
- [ ] Card density unchanged (bars ≤ 36px vertical)
- [ ] Session start latency increase ≤ 500ms (JIT refresh bounded)

## Files Touched

- `packages/server/src/services/credential-manager.ts` — add `findNextReadyAsync`
- `packages/server/src/services/usage-fetcher.ts` — add `refreshStaleQuotas`
- `packages/server/src/services/account-auto-switch.ts` — use async variant, log proactive miss
- `packages/server/src/services/settings-helpers.ts` — `getSettingNumber`
- `packages/server/src/routes/accounts.ts` — quota in list + refresh endpoint
- `packages/shared/src/types/account.ts` — extend `AccountInfo`
- `packages/web/src/lib/api/accounts.ts` — `refreshQuota`
- `packages/web/src/components/settings/account-quota-bars.tsx` — new (~60 LOC)
- `packages/web/src/components/settings/accounts-tab.tsx` — mount bars + threshold slider + visibility effect
- `packages/web/src/components/settings/account-usage-panel.tsx` — relabel banners/titles
- Tests: 4 new files

## Dependencies

- Phase 1 complete (fetcher + schema + OAuth refresh)
- `rateLimitTier` populated (already working)

## Ship Gate

After this phase, observe 1 week:
- "Sessions no longer hit mid-conversation rate limit" → **STOP HERE, feature done**
- "I want to see quota warnings without opening Settings" → proceed to Phase 3 (poller + toast)
- "Proactive threshold too aggressive/lenient" → tune default, don't add code

## Risks

- **JIT refresh adds 300-500ms session-start latency**: bounded by 2s timeout + concurrency cap. If a provider is down, falls back to stale data (better than blocking).
- **All accounts over threshold deadlock**: fallback to "least-over-limit" prevents this, but test with 2 accounts both at 95% to confirm.
- **MAX across windows**: intentional for MVP simplicity — user picks one switch threshold applied to `MAX(5h, weekly, opus, sonnet)`. Covers every plan tier with one rule. If feedback says "weekly 90% too strict because the 7-day window drags account offline for days", split into per-window thresholds in Phase 3 (schema-compatible, 2 more rows per tier).
- **Weekly-reaches-threshold-days-before-reset edge case**: at `weekly=92% @ day 5`, account is benched for ~2 days until reset. Mitigation: UI shows "resets in Xd Yh" so user sees the impact; if many accounts, round-robin falls back to min-maxUtil (picks the 92% one as least-bad). Monitor via log — if users complain, split thresholds.
- **Cost tiebreaker still uses local USD**: intentional, still useful secondary signal. Replace only if proven wrong in production.

## Out of Scope (Phase 3+)

- Background poll when no session running
- Toast / push notifications on threshold crossing
- Telegram command showing quota
- Per-account threshold override (global setting only for MVP)
