# Feature: License & Auth Flow Redesign

## Problem

Two different "keys" with confusing UX:

| Key | Purpose | Where entered | Stored |
|-----|---------|---------------|--------|
| `API_KEY` (server auth) | Protect server endpoints from unauthorized access | Login page | localStorage `api_key` |
| License key (Companion Pro) | Unlock premium features (CodeGraph, etc.) | Settings page | Server-side `.license-cache.json` |

**User confusion**: Enters server API key at login → goes to Settings → sees "Trial 7 days left" → thinks "I already entered my key, why am I on trial?"

These are 2 unrelated concepts but the UI doesn't distinguish them at all.

## Root cause

The `API_KEY` auth gate was designed for self-hosted security (prevent random people hitting your server). But it looks like a license activation step. Users conflate "I gave a key" with "I'm licensed."

## Phases

| # | Name | Status | Summary |
|---|------|--------|---------|
| 1 | Clarify login UX | ⬚ Pending | Rename login to "Server Password" or "Access Code", not "key" |
| 2 | Merge flows | ⬚ Pending | If license key is active, skip API_KEY login (or auto-derive) |
| 3 | First-run experience | ⬚ Pending | New user → trial auto-activates → no login wall unless API_KEY is set |

## Key Decisions (TBD)

- Should `API_KEY` be optional? (Currently server works without it in dev mode)
- Should license key replace API_KEY entirely? (Enter license key → server trusts you)
- Should first-run show onboarding wizard instead of login gate?
- Trial should auto-activate silently — no gate at all for first 7 days

## Current flow
```
App open → Login page (enter API_KEY) → Dashboard → Settings (enter License key)
```

## Proposed flow
```
App open → First run? → Onboarding wizard → Auto-trial (7 days, no gate)
         → Has API_KEY set? → Simple password prompt ("Access code set by admin")
         → Dashboard → License badge in header (Trial/Starter/Pro)
         → Click badge → Activate license key
```

## Files involved
- `packages/web/src/components/auth/auth-guard.tsx` — login gate logic
- `packages/web/src/app/login/page.tsx` — login page UI
- `packages/server/src/services/license.ts` — license verification
- `packages/server/src/index.ts` — API_KEY middleware
- `packages/web/src/components/settings/` — license section in settings
