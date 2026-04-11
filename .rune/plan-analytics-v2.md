# Feature: Analytics v2 — Feature Intelligence Dashboard

## Overview
Upgrade Analytics page from basic session stats to a full Feature Intelligence Dashboard.
Fix infinite loop bug, persist RTK/context data, redesign Recent Sessions, add tabs for RTK/Wiki/CodeGraph/AI Context metrics.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Bug Fix + Data Layer | ✅ Done | plan-analytics-v2-phase1.md | Fix infinite loop, add RTK columns, persist RTK on session end |
| 2 | Stats API + Recent Sessions | ✅ Done | plan-analytics-v2-phase2.md | /api/stats/features endpoint, redesign Recent Sessions (expandable, source, startedAt) |
| 3 | Feature Intelligence Tabs | ✅ Done | plan-analytics-v2-phase3.md | RTK Performance, Wiki KB Health, CodeGraph tabs |
| 4 | Context Injection Logging | ✅ Done | plan-analytics-v2-phase4.md | Persist context:injection events to DB, surface in AI Context tab |

## Key Decisions
- `sessions.source` already exists (default "api") — no migration needed for source tracking
- RTK stats need 3 new columns in sessions table (migration 0032)
- Context injection logging is Phase 4 (lower priority, needs new table)
- Analytics tabs are client-only — no SSR needed (data fetched via API)
- Expandable rows in Recent Sessions instead of navigating to /sessions/[id]

## Architecture
```
[Analytics Page]
  ├── Tab: Overview (existing, improved)
  │   ├── KPI Cards
  │   ├── Charts (daily sessions/cost)
  │   └── Recent Sessions (redesigned, expandable)
  ├── Tab: RTK Performance (new)
  ├── Tab: Wiki KB Health (new)
  ├── Tab: AI Context (new, Phase 4)
  └── Tab: CodeGraph (new)

[Backend]
  GET /api/stats         → existing, add source + startedAt + RTK aggregates
  GET /api/stats/features → new, Wiki + CodeGraph + Context stats
```

## Dependencies/Risks
- RTK migration must run before RTK data appears in analytics
- Wiki stats are filesystem-based (no DB) — API call per domain needed
- CodeGraph stats depend on projects having been scanned
