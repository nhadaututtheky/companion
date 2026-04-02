# Feature: AI Context Intelligence — Unified Redesign

## Overview

Merge CodeGraph + WebIntel panels into single "AI Context" panel.
Both features already 95% implemented — this is a UI unification, not a rebuild.

## Why

- 2 separate panels with dead-end UX (no project selector, hidden value)
- Users don't know AI auto-injects code symbols + library docs into every message
- "CodeGraph" and "WebIntel" are implementation names, not user concepts
- Both serve same purpose: **make Claude smarter about your project**

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| CodeGraph scanner | ✅ Done | AST parsing, symbol extraction, 5 lang support |
| CodeGraph injection | ✅ Done | project-map at init, context per-message, plan review, break-check |
| WebIntel service | ✅ Done | scrape, search, research, crawl, 120+ lib detection |
| WebIntel injection | ✅ Done | auto-detect lib mentions → fetch docs → inject (ws-bridge L2118-2188) |
| CodeGraph panel UI | ✅ Done (to delete) | Standalone panel, no project selector |
| WebIntel panel UI | ✅ Done (to delete) | Standalone panel, dead when webclaw offline |
| **Unified panel UI** | ✅ Done | Merged into ai-context-panel.tsx |

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Unified Panel | ✅ Done | plan-codegraph-redesign-phase1.md | Merge panels, project selector, source cards, explore tab |
| 2 | Live Context Feed | ⬚ Pending | plan-codegraph-redesign-phase2.md | Real-time injection events (WS `context:injection` events) |
| 3 | User Controls | ⬚ Pending | plan-codegraph-redesign-phase3.md | Toggle sources, exclude paths, token budgets |
| 4 | WebIntel Setup Flow | ⬚ Pending | plan-codegraph-redesign-phase4.md | Guided webclaw Docker setup, auto-start |
| 5 | Visual Graph | ⬚ Stretch | plan-codegraph-redesign-phase5.md | Interactive dependency visualization |

## Key Decisions

- Only Phase 1 planned for now — phases 2-5 deferred
- Zero backend changes in Phase 1 — pure UI refactor
- Keep `codegraph` and `webintel` as internal/API names
- Panel works WITHOUT active session — standalone project selector
- Replace 2 header buttons with 1 "AI Context" (Brain icon)
- Server injection logic stays untouched (ws-bridge.ts)
