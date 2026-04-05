# Feature: Live CodeGraph Harness

## Overview
Transform CodeGraph from a static scan-and-view tool into a **live harness layer** that serves two audiences simultaneously:
- **Frontend (Human)**: real-time visualization of agent activity mapped to code structure
- **Backend (Agent)**: self-awareness context injection — agent sees its own footprint and impact

## Design Principle
> Frontend = human eyes. Backend = agent brain optimization.
> The same event stream powers both — diverging at the consumption layer.

## Architecture

```
ws-bridge (tool_use events)
    │
    ▼
┌─────────────────────────┐
│  Graph Event Collector   │  ← NEW: extracts filePath + symbolName from tool events
│  (backend, fire-and-forget) │
└────────┬────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────────┐
│ Human  │ │ Agent Feed   │
│ Layer  │ │ (context XML)│
│        │ │              │
│ P1: Highlight │ P3: Self-awareness │
│ P2: Fog-of-War │ inject back to    │
│ P4: LLM labels │ agent context     │
└────────┘ └──────────────┘
```

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Event-Tap Overlay | ⬚ Pending | plan-live-codegraph-phase1.md | Backend event collector + frontend node highlights with decay |
| 2 | Fog-of-War Reveal | ⬚ Pending | plan-live-codegraph-phase2.md | Progressive reveal animation + coverage ring for spectators |
| 3 | Dual-Use Agent Feed | ⬚ Pending | plan-live-codegraph-phase3.md | Graph activity → XML context injection → agent self-awareness |
| 4 | LLM-Enriched Labels | ⬚ Pending | plan-live-codegraph-phase4.md | Human-readable feature names on nodes via cached LLM calls |

## Key Decisions
- Event-tap is fire-and-forget — NEVER block agent thread
- Impact radius BFS capped at 2 hops / 15 nodes max
- Highlight decay: 10s default, configurable
- Backend event collector is shared infra for all phases
- Agent feed (P3) reuses existing `buildMessageContext` pipeline
- 10K node future: viewport culling + LOD (dots outside viewport)

## Event Flow (Shared Across Phases)

```
CLI tool_use (Edit/Write/Bash)
  → ws-bridge intercepts tool event
  → extract filePath from toolInput
  → lookup codegraph nodes by filePath
  → emit graph:activity event { sessionId, filePath, nodeIds[], timestamp, toolName }
  → broadcast to:
      1. Frontend WS (human visualization)
      2. Graph Activity Accumulator (agent feed buffer)
```

## Quick Wins (Outside Phases)
- [ ] MCP status icon + toggle in sidebar/header (simple shortcut to settings)
- [ ] Skills quick-view panel (list available skills with status)
- [ ] Browser preview panel for MCP design tools (Pencil/Stitch/Figma output)
