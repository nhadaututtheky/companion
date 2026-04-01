# Companion Intelligence Layer — Execution Runbook

> This file is the SINGLE SOURCE OF TRUTH for cross-session execution.
> Every session MUST read this file first and continue from where the last session left off.
> Update status IMMEDIATELY after completing each step.

## Execution Order

| # | Plan | Phase | Status | Commit |
|---|------|-------|--------|--------|
| 1 | WebIntel | Phase 1: Sidecar + Scrape Service | ✅ Done | 2e94991 |
| 2 | WebIntel | Phase 2: Agent Auto-Injection | ✅ Done | 48e276c |
| 3 | WebIntel | Phase 3: Web Research + Crawl | ✅ Done | ab06b91 |
| 4 | WebIntel | Phase 4: UI + Telegram Commands | ✅ Done | — |
| 5 | WebIntel | Full Review + Integration Test | ✅ Done | 76047e4 |
| 6 | CodeGraph | Phase 1: Scanner + Store | ✅ Done | 0c7ca9a |
| 7 | CodeGraph | Phase 2: Semantic + Diff | ✅ Done | — |
| 8 | CodeGraph | Phase 3: Agent Interface | ✅ Done | — |
| 9 | CodeGraph | Phase 4: API + Web UI | ✅ Done | — |
| 10 | CodeGraph | Full Review + Integration Test | ✅ Done | — |
| 11 | Bridge | CodeGraph ↔ WebIntel integration | ✅ Done | — |
| 12 | Final | E2E test all features + ship | ⬚ TODO | — |

## Protocol Per Phase

```
1. READ the phase plan file (.rune/plan-*-phaseN.md)
2. IMPLEMENT all tasks in the phase
3. VERIFY: bun run build (must pass)
4. REVIEW: check for bugs, security issues, missing edge cases
5. FIX: any issues found in review
6. COMMIT: semantic message (feat: webintel phase N — summary)
7. UPDATE: mark phase done in this runbook + phase plan file
8. CONTINUE to next phase (no pause, no questions)
```

## Protocol Per Plan Completion (after all phases of a plan)

```
1. FULL REVIEW: re-read all files created/modified across all phases
2. INTEGRATION TEST: verify features work together
3. FIX: any cross-phase issues
4. COMMIT: any fixes (fix: webintel review — summary)
5. UPDATE: mark plan review done in this runbook
6. CONTINUE to next plan
```

## Session Handoff Protocol

If context is running low:
1. UPDATE this runbook with exact current status
2. NOTE any in-progress work, decisions made, blockers found
3. Next session reads this runbook + relevant phase plan and continues

## Current Session Notes

_Updated by each session:_

- **Session start**: 2026-04-01
- **Last completed step**: CodeGraph Phase 1 (step 6) — 906 nodes, 745 edges in 2.4s
- **Currently working on**: Final E2E (step 12)
- **Blockers**: None
- **Decisions made this session**:
  - webclaw as Docker sidecar (REST API on port 3100)
  - tree-sitter replaces @swc/core for multi-language support
  - contextplus patterns adopted: blast radius, token pruning, embeddings
  - WebIntel before CodeGraph (faster setup, immediate value)

## Key File Locations

| File | Purpose |
|------|---------|
| `.rune/plan-webintel.md` | WebIntel master plan |
| `.rune/plan-webintel-phase1.md` | Phase 1 detail |
| `.rune/plan-webintel-phase2.md` | Phase 2 detail |
| `.rune/plan-webintel-phase3.md` | Phase 3 detail |
| `.rune/plan-webintel-phase4.md` | Phase 4 detail |
| `.rune/plan-codegraph.md` | CodeGraph master plan |
| `.rune/plan-codegraph-phase1.md` | Phase 1 detail (updated with tree-sitter) |
| `.rune/plan-codegraph-phase2.md` | Phase 2 detail |
| `.rune/plan-codegraph-phase3.md` | Phase 3 detail |
| `docker-compose.yml` | Docker services (add webclaw here) |
| `packages/server/src/services/ws-bridge.ts` | Main injection point for both features |
| `packages/server/src/services/ai-client.ts` | AI client for summaries/descriptions |
| `packages/server/src/db/schema.ts` | Drizzle schema |
