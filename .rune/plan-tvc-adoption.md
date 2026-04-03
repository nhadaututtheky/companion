# TVC Feature Adoption — Master Plan

## Goal
Adopt 9 high-impact features from The Vibe Company's Companion into our codebase,
grouped into 5 phases ordered by dependency chain and effort.

## Phase Overview

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Foundation: State Machine + Event Bus | ✅ Done | plan-tvc-adoption-phase1.md | Formal session phases, typed event bus |
| 2 | Quick Wins: Names + Prompts | ⬚ Pending | plan-tvc-adoption-phase2.md | Auto session names, saved prompt templates |
| 3 | Safety: Permission Pre-filter | ⬚ Pending | plan-tvc-adoption-phase3.md | Auto-approve safe tools, auto-deny dangerous |
| 4 | Git: Worktrees + PR Panel | ⬚ Pending | plan-tvc-adoption-phase4.md | Isolated worktrees, GitHub PR status |
| 5 | Agents + Updates + Drift Tests | ⬚ Pending | plan-tvc-adoption-phase5.md | Cron enhancements, update checker, protocol tests |

## Dependency Graph
```
Phase 1 (State Machine + Event Bus)
  └─> Phase 3 (Pre-filter uses state guards + event bus)
  └─> Phase 4 (Worktrees use state machine lifecycle hooks)
Phase 2 (Names + Prompts) — independent, can parallel with Phase 1
Phase 5 (Agents + Updates) — depends on Phase 1 event bus
```

## Key Decisions
- State machine in shared types + server service
- Event bus as typed singleton (not external lib)
- Saved prompts use new DB table (not session_templates)
- Permission pre-filter hooks into existing handleHookEvent()
- Worktree tracking in DB (not flat JSON)
- PR panel polls `gh` CLI, pushes via WebSocket
