# Feature: Multi-Account Manager

## Overview
Store multiple Anthropic OAuth credentials, switch instantly without browser login, track usage per account, auto-switch on rate limit. Zero friction — Companion watches `.credentials.json` and auto-captures after each `/login`.

## How It Works
```
Login flow (one-time per account):
  1. User does /login in Claude Code (opens browser, OAuth)
  2. Claude Code writes ~/.claude/.credentials.json
  3. Companion file watcher detects change
  4. Extracts claudeAiOauth section → encrypts → saves to DB
  5. Auto-labels: "Max #1", "Pro #2" etc. from subscriptionType

Switch flow (instant, no browser):
  1. User picks account from Web UI or Telegram /account command
  2. Companion writes saved credentials → ~/.claude/.credentials.json
  3. Next session uses new account automatically
  4. Running sessions continue with their original account

Auto-switch flow:
  1. CLI stderr/stdout emits rate limit error (429 / overloaded)
  2. Companion catches error, marks current account "rate_limited"
  3. Finds next available account → swaps credentials
  4. Restarts session with --resume → seamless continuation
```

## Credential File Structure
```json
{
  "claudeAiOauth": {           ← THIS changes per account
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1776274846555,
    "scopes": ["user:inference", ...],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  },
  "mcpOAuth": { ... }          ← SHARED across all accounts (keep as-is)
}
```

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | DB + Credential Manager | ✅ Done | plan-multi-account-phase1.md | Schema, encrypt/decrypt, CRUD helpers, REST API |
| 2 | File Watcher + Switch | ✅ Done | plan-multi-account-phase2.md | Auto-capture on login, instant switch, session integration |
| 3 | Usage + Auto-Switch | ✅ Done | plan-multi-account-phase3.md | Per-account usage, rate limit detection, auto-switch logic |
| 4 | UI + Telegram | ✅ Done | plan-multi-account-phase4.md | Account picker in web, /account Telegram command, alerts |

## Key Decisions
- Only `claudeAiOauth` section is per-account — `mcpOAuth` stays shared
- Credentials encrypted at rest (AES-256-GCM, key from COMPANION_ENCRYPTION_KEY env or derived from access PIN)
- File watcher uses polling (500ms) not fs.watch (unreliable on Windows)
- Auto-switch only triggers on rate limit, not on errors
- Running sessions keep their original account — switch applies to NEW sessions only
- Account label auto-generated from subscriptionType + index but user can rename
