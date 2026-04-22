# Phase 4: SDK Header Intercept (optional optimization)

## Goal

Eliminate the network cost of polling for SDK-engine users by reading `anthropic-ratelimit-unified-*` headers from every Anthropic API response the SDK engine makes. **Pure optimization — never ship until Phase 3 proves polling works end-to-end.**

## Trigger to start this phase

- [ ] Phase 3 running in production for ≥1 month stable
- [ ] SDK engine adoption ≥30% of active sessions
- [ ] Network cost measurably annoying (e.g., complaints about battery on laptops)

## Tasks

### 4.1 Header extraction in SDK engine
- [ ] Hook `@anthropic-ai/sdk` response middleware:
  - Response event → read these 4 headers (all strings):
    - `anthropic-ratelimit-unified-5h-utilization`
    - `anthropic-ratelimit-unified-5h-reset`
    - `anthropic-ratelimit-unified-7d-utilization`
    - `anthropic-ratelimit-unified-7d-reset`
- [ ] For Team/Enterprise also check `-opus` and `-sonnet` variants if present
- [ ] Convert to `AccountQuota` shape → pass to `usage-fetcher.applyFreshQuota(accountId, partial)`

### 4.2 `usage-fetcher.applyFreshQuota` (new method)
- [ ] Upsert utilization + resets_at columns WITHOUT hitting network
- [ ] Only update fields present in payload (partial merge, preserve weekly if only 5h came back)
- [ ] Update `quota_fetched_at = Date.now()`
- [ ] Emit same `account:quota:warning` events as poller

### 4.3 Poller integration
- [ ] Poller checks `quota_fetched_at` — if <60s → skip this tick (header intercept handled it)
- [ ] This naturally eliminates redundant fetches for active SDK sessions

### 4.4 CLI path note
- [ ] CLI adapter still cannot access headers → CLI users unchanged, still rely on poller
- [ ] Document in `FEATURE_REGISTRY.md`: SDK users enjoy free realtime, CLI users use 5m poll

### 4.5 Tests
- [ ] Mock SDK response with rate-limit headers → DB updated
- [ ] Partial headers (only 5h present) → 7d preserved
- [ ] Malformed header value (non-numeric) → ignored, no crash
- [ ] Stale header (> poller TTL) → still processed (server decides freshness)

## Acceptance Criteria

- [ ] SDK session generates ≥1 quota update per message exchange (no extra network)
- [ ] Network dashboard shows decreased `/api/oauth/usage` calls when SDK sessions running
- [ ] CLI-only accounts see no change (poller still handles them)
- [ ] No duplicate events when poller + header fire within same TTL window

## Files Touched

- `packages/server/src/services/sdk-engine.ts` — add response interceptor
- `packages/server/src/services/usage-fetcher.ts` — add `applyFreshQuota`
- `packages/server/src/services/quota-poller.ts` — respect `quota_fetched_at`
- `packages/server/src/tests/sdk-engine-headers.test.ts` — new
- `FEATURE_REGISTRY.md` — document SDK vs CLI quota behavior

## Dependencies

- Phase 1, 2, 3 all stable in production
- SDK engine widely adopted

## Risks

- **SDK version drift**: Anthropic SDK renames header access method → interceptor breaks. Mitigation: feature-flag this path, fall back to poller.
- **Event spam**: every request emits an update → downstream subscribers flooded. Debounce to 1 event / 5s per account.
- **Adapter INV boundary**: touching `sdk-engine.ts` is near INV-protected zone. Require `logic-guardian` review before merge.

## Decision point

If during Phase 3 stabilization the SDK engine adoption drops (e.g., CLI features pull ahead), **cancel this phase entirely**. The savings aren't worth the adapter coupling risk for a minority path.
