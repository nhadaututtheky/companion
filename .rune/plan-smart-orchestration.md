# Feature: Smart Orchestration Layer

## Overview
Biến Companion từ "switchboard" (user tự dispatch) thành "autonomous orchestrator" (tự classify task → chọn pattern → spawn agents → chain outputs). Build trên 3 hệ thống đã có: RTK, CodeGraph, Workflow/Debate engine.

## Architecture

```
User message
    │
    ▼
┌─────────────────┐
│ Task Classifier  │ ← CodeGraph (relevant files) + Session History
│ (AI: Haiku)      │
└────────┬────────┘
         │ { type, complexity, files[], model }
         ▼
┌─────────────────┐
│ Dispatch Router  │ ← Routes to correct orchestration pattern
└────────┬────────┘
         │
    ┌────┼────┬──────────┐
    ▼    ▼    ▼          ▼
  Single  Workflow  Debate   Mention
  Session (seq)     (parallel) (forward)
    │       │         │         │
    └───────┼─────────┼─────────┘
            ▼
┌─────────────────┐
│ Session Memory   │ ← Learn from outcomes
│ (post-mortem)    │
└─────────────────┘
```

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Task Classifier | ✅ Done | plan-smart-orchestration-phase1.md | Classify intent → pick pattern + model |
| 2 | Dispatch Router | ✅ Done | plan-smart-orchestration-phase2.md | Wire classifier → existing engines |
| 3 | Context Curator | ✅ Done | plan-smart-orchestration-phase3.md | RAG-style selective injection per task |
| 4 | Session Memory | ✅ Done | plan-smart-orchestration-phase4.md | Learn patterns, preferences, mistakes |
| 5 | UI + Feedback Loop | ⬚ Pending | plan-smart-orchestration-phase5.md | User can see/override dispatch decisions |

## Key Decisions
- Classifier uses Haiku (fast, cheap) — NOT Opus. Classify in <2s
- Build ON TOP of existing engines — no rewrite of workflow/debate/mention
- Session Memory = SQLite table, not Neural Memory (local, fast, no MCP dependency)
- Context Curator enhances existing agent-context-provider.ts, not replacing it
- RTK already handles output compression — Curator handles INPUT curation (complementary)

## What Already Exists (Reuse, Don't Rebuild)
- **Workflow engine** → sequential chains (planner→builder→verifier)
- **Debate engine** → parallel multi-agent (4 formats + convergence)
- **Mention router** → cross-session forwarding
- **CodeGraph query-engine** → keyword search, impact radius, hot files
- **Agent-context-provider** → 5 injection points (project map, message context, plan review, break check, activity feed)
- **Context-budget.ts** → priority-based token allocation
- **RTK pipeline** → output compression (10 strategies)
- **Session-summarizer** → AI summary on session end
- **Event-collector** → tracks file touches per session
