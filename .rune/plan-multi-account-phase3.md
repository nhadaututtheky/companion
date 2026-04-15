# Phase 3: Usage Tracking per Account + Rate Limit Detection + Auto-Switch

## Goal
Aggregate usage by account, detect rate limits from CLI output, auto-switch to next available account.

## Tasks
- [ ] Per-account usage aggregation:
  - [ ] On session complete: add session cost to `accounts.total_cost_usd`
  - [ ] Track daily cost per account (extend `daily_costs` table with `account_id`)
  - [ ] API endpoint: GET /api/accounts/:id/usage — daily/weekly/total breakdown
- [ ] Rate limit detection in CLI output:
  - [ ] In `claude-adapter.ts` stderr reader: detect patterns:
    - `rate limit` / `429` / `overloaded` / `Too many requests`
    - `Request rate limit reached` / `Token rate limit reached`
  - [ ] On detection: emit `account:rate_limited` event with account ID
  - [ ] Mark account status = "rate_limited", status_until = now + cooldown (varies by tier)
- [ ] Auto-switch logic:
  - [ ] On `account:rate_limited` event:
    1. Find next account with status = "ready" (round-robin order)
    2. If found: call switchAccount(), notify user, optionally restart session
    3. If none available: notify user "all accounts rate limited"
  - [ ] Configurable: `autoSwitch.enabled` setting (default: true)
  - [ ] Configurable: `autoSwitch.restartSession` (default: false — just switch for next session)
- [ ] Rate limit cooldown management:
  - [ ] Background timer: check status_until periodically, reset to "ready" when expired
  - [ ] Default cooldowns by tier:
    - `default_claude_max_20x`: 60s (high quota, short cooldown)
    - `default_claude_pro_5x`: 300s
    - Other: 600s
- [ ] Token refresh handling:
  - [ ] If accessToken expired (check `expiresAt`): mark account "expired"
  - [ ] User needs to `/login` again to refresh — Companion can't do OAuth flow

## Rate Limit Detection Patterns
```typescript
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /429/,
  /overloaded/i,
  /too many requests/i,
  /request rate limit/i,
  /token rate limit/i,
  /capacity/i,
];
```

## Auto-Switch Flow
```
CLI stderr → "rate limit exceeded"
    ↓
credential-manager.markRateLimited(accountId, cooldownMs)
    ↓
credential-manager.findNextReady() → nextAccount
    ↓
if nextAccount:
  switchAccount(nextAccount.id)
  notify("⚠️ Account rate limited, switched to {nextAccount.label}")
else:
  notify("🚫 All accounts rate limited. Wait or add new account.")
```

## Acceptance Criteria
- [ ] Usage stats visible per account (cost, tokens, sessions)
- [ ] Rate limit detected within 5s of CLI error
- [ ] Auto-switch happens without user intervention (if enabled)
- [ ] Rate-limited accounts auto-recover after cooldown period
- [ ] Expired accounts clearly marked — user knows to re-login
- [ ] All events logged and optionally sent to Telegram

## Files Touched
- `packages/server/src/services/credential-manager.ts` — rate limit + auto-switch logic
- `packages/server/src/services/adapters/claude-adapter.ts` — stderr rate limit detection
- `packages/server/src/services/ws-message-handler.ts` — result cost → account aggregation
- `packages/server/src/routes/accounts.ts` — usage endpoint
- `packages/server/src/db/schema.ts` — daily_costs.account_id
