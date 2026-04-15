# Phase 4: Web UI + Telegram Integration

## Goal
Account management UI in web sidebar, Telegram commands for switching/monitoring, usage alerts.

## Tasks
- [ ] Web UI — Account Manager panel:
  - [ ] Account list in Settings or sidebar: label, plan badge, status dot, usage
  - [ ] "Active" indicator on current account
  - [ ] Click to switch (calls POST /api/accounts/:id/activate)
  - [ ] Edit label (inline rename)
  - [ ] Delete account (with confirmation)
  - [ ] Usage chart per account (daily cost, mini sparkline)
  - [ ] Status indicators: 🟢 ready, 🟡 rate_limited (with countdown), 🔴 expired
- [ ] Web UI — Session creation:
  - [ ] Show which account will be used (active account badge)
  - [ ] Optional: account picker dropdown per session
- [ ] Telegram commands:
  - [ ] `/account` — list all accounts with status
  - [ ] `/account switch <label|id>` — switch active account
  - [ ] `/account usage` — show usage summary per account
  - [ ] `/account rename <id> <new_label>` — rename account
- [ ] Telegram inline keyboards:
  - [ ] Account list with switch buttons
  - [ ] Rate limit alert with "Switch to X" quick action
- [ ] Alerts:
  - [ ] Telegram notification on rate limit: "⚠️ {label} hit rate limit. Switched to {next}."
  - [ ] Telegram notification on auto-capture: "📥 New account captured: {label} ({plan})"
  - [ ] Optional daily usage summary: "📊 Today: Account A $2.30, Account B $1.50"
- [ ] Account info in session header:
  - [ ] Web: show account label in session panel
  - [ ] Telegram: include account label in session init message

## Telegram Command Design
```
/account
→ 📋 Accounts:
  1. 🟢 Work Max (active) — $12.30 today
  2. 🟡 Personal Max — rate limited (2m left)
  3. 🟢 Team Pro — $3.40 today
  [Switch to 2] [Switch to 3] [Usage Details]

/account switch 3
→ ✅ Switched to "Team Pro". Next session will use this account.

/account usage
→ 📊 Usage (last 7 days):
  Work Max: $45.20 | 2.1M tokens | 34 sessions
  Personal Max: $23.10 | 1.0M tokens | 18 sessions
  Team Pro: $8.90 | 0.4M tokens | 12 sessions
```

## Acceptance Criteria
- [ ] Accounts visible and switchable from both Web and Telegram
- [ ] Rate limit alerts sent to Telegram automatically
- [ ] New account capture notification works
- [ ] Session shows which account it's using
- [ ] Usage data accurate and matches per-session tracking

## Files Touched
- `packages/web/src/components/settings/account-manager.tsx` — new
- `packages/web/src/hooks/use-accounts.ts` — new (API hooks)
- `packages/web/src/lib/api/accounts.ts` — new (API client)
- `packages/server/src/telegram/commands/account.ts` — new
- `packages/server/src/telegram/telegram-bridge.ts` — register account commands
- `packages/server/src/telegram/telegram-session-events.ts` — account label in session init
