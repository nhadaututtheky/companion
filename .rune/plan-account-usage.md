# Feature: Per-Account Quota Tracking (5h / Weekly)

## Overview

Surface Anthropic's own rate-limit utilization (`five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`) per account. Source of truth = `GET /api/oauth/usage` (reverse-engineered from Claude Code v2.1.116 binary).

**This is a correctness fix, not a UI feature.** The existing `AccountUsagePanel` and `findNextReady()` round-robin both compute windows from the local `sessions` table — which is wrong whenever the same account runs outside Companion (other machine, direct CLI, another Claude Code install). Results:
- Round-robin currently picks accounts that are actually at 99% quota → session fails → regex catches `rate_limit` error → THEN swaps. Reactive, costs 1 failed request per miss.
- UI shows "5h: 42%" that doesn't match what `claude` CLI `/usage` shows.

**Goal**: Quota from Anthropic becomes the source of truth for both round-robin gating AND the UI. Local USD cost stays as secondary info ("this machine's bill estimate").

## Strategy — progressive enhancement

Ship **Alt D (on-demand)** first. Evolve to **Alt A (smart-cadence poll)** only if UX feedback demands proactive warnings. Optional **Alt B (SDK header intercept)** deferred as pure optimization.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Fetcher + Schema | ✅ Done (2026-04-22) | `plan-account-usage-phase1.md` | `usage-fetcher.ts`, DB columns, OAuth refresh helper, 14 tests |
| 2 | Round-robin fix + inline bars (MVP) | ⬚ Pending | `plan-account-usage-phase2.md` | (a) `findNextReady` gates on Anthropic quota; (b) inline bars in account card |
| 3 | Smart Poller (evolve if needed) | ⬚ Deferred | `plan-account-usage-phase3.md` | Visibility-aware poller, staggered, backoff, 429 handling |
| 4 | SDK Header Intercept (optional) | ⬚ Deferred | `plan-account-usage-phase4.md` | Zero-cost realtime for SDK engine users only |

## Key Decisions

- **Inline in existing card, no new panel/page**: Render 2 slim progress bars (5h / weekly) INSIDE each account row in `accounts-tab.tsx`. Extract a small presentational `AccountQuotaBars` (~60 LOC) only if reused in Telegram bridge later.
- **Two user-configurable thresholds, not one**:
  - `accounts.warnThreshold` (default `0.7`) — UI only: bar turns yellow, badge shown, toast emit (Phase 3)
  - `accounts.switchThreshold` (default `0.9`) — round-robin gate: skip account when `maxUtil >= switchThreshold`
  - Slider step: `0.05` (5% increments)
  - Invariant: `warnThreshold < switchThreshold` (min gap 0.05), enforced by slider UI + server
  - Both slid in same Auto Switch settings section; warn-slider bound to `[0.5, switch-0.05]`, switch-slider bound to `[warn+0.05, 0.95]`
- **MAX-utilization across windows** (single-threshold simplicity): each account has 2-3 window utils (5h + weekly, or 5h + opus + sonnet for Team/Enterprise). Compute `maxUtil = MAX(all quota_*_util)` and gate on that single number. One threshold pair covers every window — no 4-slider UI. Split into per-window thresholds later only if user feedback shows weekly+5h need different sensitivities.
- **Round-robin proactive gate**: `findNextReady()` adds a quota gate — skip accounts where `maxUtil >= switchThreshold`. Falls back to reactive regex path if quota data missing/stale (>5m).
- **JIT refresh before pick**: When `findNextReadyAsync()` is called (session start, manual swap), trigger `refreshStaleQuotas(60_000)` for all `ready` accounts first. Parallelized, bounded to 3 concurrent. +300-500ms one-time latency, prevents the failed-request penalty.
- **Existing cost panel relabeled, NOT deleted**: `AccountUsagePanel` stays but its "5h/7d rolling window %" is explicitly relabeled "this device's activity only" so users don't confuse it with the Anthropic quota bars in the card. USD billing estimate remains useful for users on the API plan.
- **OAuth refresh built from scratch**: `POST https://console.anthropic.com/v1/oauth/token` with per-account mutex. Reused by every future endpoint call (not just usage).
- **Status merge, not override**: If poll says `utilization >= 1.0` AND regex-based `rate_limited` event is active, both route into the same `status=rate_limited` + `statusUntil=resets_at`. Source tag in log only.
- **Ship Alt D first**: 2026-04-17 UX-priority memory says UX > features. On-demand with timestamp is the leanest shippable win. Skip to Phase 3 only after user feedback.
- **Tier-aware UI**: Pro/Max → show `five_hour` + `seven_day`. Team/Enterprise → show `five_hour` + `seven_day_opus` + `seven_day_sonnet`. Read from `accounts.rateLimitTier`.
- **Privacy discipline**: Log booleans only (has-X), never raw values. Same pattern as `profile-fetcher.ts`.

## Invariants Touched

- None of INV-1..INV-15 directly affected. Schema addition is additive (new nullable columns).
- `credential-manager.findNextReady` signature extends with optional quota gate — existing callers still work (fallback path).
- New invariant candidates (discuss after Phase 1):
  - **INV-16** — OAuth access tokens MUST route through `oauth-token-service.ts`; never decrypt + use inline.
  - **INV-17** — Round-robin MUST NOT pick an account with `quota_*_util >= switchThreshold` unless all eligible accounts are above threshold (then pick lowest util).
  - **INV-18** — `warnThreshold < switchThreshold` always; UI slider + server validation both enforce.

## Out of Scope

- Team/Enterprise admin endpoints (`/api/organizations/*`)
- Extra-usage ("overage") purchase flow
- Alert rules ("notify when 5h > 80%") — Phase 3+ only
- Telegram notification — separate follow-up task
