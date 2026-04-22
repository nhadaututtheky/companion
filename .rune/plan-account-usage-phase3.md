# Phase 3: Smart Poller (evolve if needed)

## Goal

Background poller with visibility-aware cadence, staggered schedule, and proactive threshold alerts. **Only build this if Phase 2 user feedback says on-demand isn't enough.**

## Trigger to start this phase

- [ ] User feedback from Phase 2 includes "I want to know BEFORE opening the tab"
- [ ] OR: debug log shows >20% of sessions start with `status=rate_limited` surprise

## Tasks

### 3.1 `quota-poller.ts` service (new, ~250 LOC)
- [ ] Central loop driven by `setInterval` with dynamic cadence per account:

  | State | Interval |
  |-------|----------|
  | Web tab focused on Multi Account | 60s |
  | Any session active + stream activity <2m ago | skip (headers will come via Phase 4) |
  | Any session active + no stream recently | 300s |
  | No session active (idle Companion) | 900s |
  | Tab hidden (`document.visibilityState !== 'visible'`) | ×2 base interval |

- [ ] Stagger: N accounts → offset each by `(basePeriod / N)` seconds
- [ ] Per-account jitter: ±10s random offset to avoid thundering herd across Companion instances
- [ ] Backoff: 429 from `/api/oauth/usage` → double interval, reset on 2xx
- [ ] Skip accounts with `status IN ('expired', 'error')` or `skipInRotation=true`
- [ ] Graceful shutdown: clear intervals on SIGTERM

### 3.2 Visibility signal from web → server
- [ ] WS message `ui:multi-account:focus` and `ui:multi-account:blur`
- [ ] Server tracks per-client visibility; poller reads union across clients

### 3.3 Threshold event emission
- [ ] New event-bus events: `account:quota:warning` (util ≥ 80%), `account:quota:critical` (util ≥ 95%)
- [ ] Dedupe: don't re-emit within 30 min for same threshold
- [ ] Reset alarm state when util drops below 70%

### 3.4 Web: proactive toast + badge
- [ ] Toast on quota warning — dismissible, pinned until acknowledged
- [ ] Multi Account tab icon badge (red dot) when any account > 90%
- [ ] Respect user-level "quiet hours" setting if exists (check settings schema)

### 3.5 Telegram bridge (follow-up task, track separately)
- [ ] `/accounts` command now shows quota %
- [ ] Optional push notification on `quota:critical` event (off by default)

### 3.6 Tests
- [ ] `quota-poller.test.ts` — stagger math, cadence transitions, backoff
- [ ] Concurrent focus/blur events — poller state correct
- [ ] Shutdown clears intervals (no leak)

## Acceptance Criteria

- [ ] Companion idle for 24h → observed <150 calls/account (sanity upper bound)
- [ ] User can see "96% used" toast without opening Multi Account tab
- [ ] No poller runs when account is expired/disabled (verified via network log)
- [ ] Multiple browser tabs open → poller doesn't multiply

## Files Touched

- `packages/server/src/services/quota-poller.ts` — new
- `packages/server/src/services/ws-message-handler.ts` — add focus/blur
- `packages/server/src/event-bus.ts` — add events
- `packages/web/src/components/settings/accounts-tab.tsx` — focus/blur dispatch
- `packages/web/src/components/layout/toast.tsx` — wire warning toast
- `packages/shared/src/types/events.ts` — add event types
- `packages/server/src/tests/quota-poller.test.ts` — new

## Dependencies

- Phase 1 + Phase 2 complete
- User feedback justifies complexity

## Risks

- **Multi-instance coordination**: 2 Companion instances on 2 machines both poll. Cheap endpoint, no coordination needed. Document the redundancy.
- **Phantom activity**: if `ws-health-idle` marks a session active but it's actually zombie → poller skips inappropriately. Cross-check `lastStreamAt` not just session status.
- **Notification fatigue**: 80% threshold hit too often. Make threshold configurable, default 90%.
