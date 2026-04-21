# Feature: Quick Commands

## Overview

Curated palette of common shell commands (git, npm, docker, k8s, python…)
surfaced as pickers in Web composer (`/cmd`) and Telegram (`/cmd`). Target
user: vibecoders who don't memorize CLI flags. Clicking a command inserts
it into the chat input — user still presses send, agent still runs + sees
output. No interception, no classifier, no safety validator.

## Architecture

```
packages/shared/src/quick-commands/
  catalog.json          ← curated from token-ninja rules (MIT attribution)
  index.ts              ← types + loader + group/command lookup

Web:
  /cmd slash → QuickCommandPicker (reuses skill-picker UX)
            → click cmd → insertText(cmd) into composer

Telegram:
  /cmd → inline keyboard (groups grid)
       → click group → inline keyboard (commands paged)
       → click cmd → bot posts cmd as user message into session
```

## Phases

| # | Name | Status | File | Summary |
|---|------|--------|------|---------|
| 1 | Catalog + Web picker | ⬚ Pending | plan-quick-commands-phase1.md | Shared catalog JSON, loader, `/cmd` slash picker in web composer |
| 2 | Telegram `/cmd` | ⬚ Pending | plan-quick-commands-phase2.md | Bot command + 2-level inline keyboard, paged command lists |
| 3 | Smart polish | ⬚ Deferred | plan-quick-commands-phase3.md | Recent commands, context-aware group ordering, favorites (pin) |

## Key Decisions

- **Data-only port** — vendor token-ninja rules as JSON in `packages/shared/`. No code imports, no classifier.
- **No auto-exec** — picker always inserts text; user reviews + sends. Keeps agent flow intact, zero INV risk.
- **Slash command over button** — `/cmd` reuses existing skill-picker pattern in composer. No new UI chrome, no UX clutter (per `feedback_ux_over_features.md`).
- **~300 commands across 10 groups** — not all 765. Curate top 30 per group (git, npm, pnpm/yarn/bun, docker, k8s, python, build, test, net/fs, db).
- **Shared catalog** — web + server + telegram all import from `@companion/shared/quick-commands`. Single source of truth.
- **Attribution** — add `NOTICE.md` crediting token-ninja MIT source for rule list.

## Non-goals (v1)

- No classifier / intent detection (user explicitly opens picker)
- No local execution / token interception
- No safety validator (user-reviewed commands only)
- No MCP server export
- No custom user-defined commands (phase 3+)
- No auto-send on click (always insert, user confirms)
