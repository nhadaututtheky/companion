# Feature: AI Context Intelligence — Unified Redesign

## Why Redesign

Companion has **two invisible AI context engines** that auto-inject knowledge into Claude sessions, but their UIs are disconnected stats dashboards that hide the real value:

### CodeGraph (codebase knowledge)
1. **Dead end UX** — panel shows "Select a project" with no selector. Depends on active session but graph is per-project.
2. **Hides the value** — user has no idea CodeGraph injects symbols, plan warnings, and break-check into every message.
3. **No control** — can't toggle injection, see what was injected, or tune relevance.
4. **Wrong mental model** — "Code Graph" sounds like a visualization tool.

### WebIntel (external docs & web research)
5. **Same hidden value** — auto-detects library mentions (100+ known libs) and injects docs. User has no idea.
6. **Misleading "Offline" state** — webclaw sidecar not running by default, but scraping is FREE (no API key needed). Only web search needs key.
7. **Panel is a dead Docker command** — shows "run this docker command" instead of explaining the value or offering setup help.
8. **Separate panel** for what is conceptually the same thing: AI context enrichment.

### Core insight
Both features serve the same purpose: **make Claude smarter about your project**. They should be unified into one panel showing all context sources.

## Overview

Merge CodeGraph + WebIntel panels into **"AI Context"** panel. Three context sources shown as a unified feed:

| Source | What it injects | Cost | Auto? |
|--------|----------------|------|-------|
| **Codebase** (CodeGraph) | Symbols, hot files, plan warnings, break-checks | Free | Yes — on every message |
| **Docs** (WebIntel scrape) | Library docs when mentions detected | Free — just needs webclaw container | Yes — auto-detect |
| **Web Search** (WebIntel search) | Research results | Needs `WEBCLAW_API_KEY` (optional) | No — agent-triggered via MCP |

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Unified Panel | ⬚ Pending | plan-codegraph-redesign-phase1.md | Merge panels, project selector, source status cards |
| 2 | Live Context Feed | ⬚ Pending | plan-codegraph-redesign-phase2.md | Real-time injection events across all sources |
| 3 | User Controls | ⬚ Pending | plan-codegraph-redesign-phase3.md | Toggle sources, exclude paths, token budgets |
| 4 | WebIntel Setup Flow | ⬚ Pending | plan-codegraph-redesign-phase4.md | Guided webclaw setup, auto-start, health monitoring |
| 5 | Visual Graph (stretch) | ⬚ Pending | plan-codegraph-redesign-phase5.md | Interactive dependency visualization |

## Key Decisions

- Merge "CodeGraph" + "WebIntel" panels → single **"AI Context"** panel
- Keep `codegraph` and `webintel` as internal/API names — only UI changes
- Panel works WITHOUT active session — standalone project selector
- Default view = live context feed (all sources mixed)
- Three source status cards at top: Codebase ✅/❌, Docs ✅/❌, Web Search ✅/❌ (optional)
- Webclaw scraping is FREE — emphasize this, don't gate behind API key messaging
- `WEBCLAW_API_KEY` only needed for web search — mark as "optional enhancement"
- Pro-tier gate stays for CodeGraph injection; WebIntel scrape could be free-tier
- Primary audience: power users who want transparency into what AI sees

## Architecture

Backend stays as-is. Changes:
- **UI**: New unified panel replacing both `codegraph-panel.tsx` and `webintel-panel.tsx`
- **WS events**: New `context:injection` event type from both CodeGraph and WebIntel injection points
- **Header**: Replace 2 panel buttons with 1 "AI Context" button
- **Setup wizard**: Guided webclaw Docker setup in Phase 4 (detect Docker, offer one-click start)
