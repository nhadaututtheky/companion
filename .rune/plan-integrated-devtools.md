# Integrated Dev Tools — Master Plan

> Goal: Add terminal, syntax-highlighted code viewer, and diff viewer to session UI
> Priority: P1 — competitive parity with 1DevTool/Vibe Companion

## Overview

Session view currently has: chat + sidebar (stats, file tree, plain `<pre>` viewer).
After this plan: chat + terminal + syntax-highlighted viewer + diff tab + multi-pane layout.

## What Already Exists (no rebuild needed)

- `TerminalPanel` component (xterm.js, fully wired to `/ws/terminal/:id`)
- `terminal-manager.ts` server service (spawn, kill, stream, list)
- `InlineDiff` component (used in tool use blocks for edit/write diffs)
- `diff-utils.ts` library (computeDiff, extractHunks)
- xterm packages already installed (`@xterm/xterm`, addons)

## What Needs Building

| Component | Current | Target |
|-----------|---------|--------|
| Terminal in session | Not present | Bottom panel, toggle via Ctrl+` |
| File viewer | Plain `<pre>` | CodeMirror 6 with syntax highlighting |
| Diff viewer | Inline in messages only | Dedicated diff tab in sidebar |
| Multi-session layout | Single session only | Split-pane with presets |

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Terminal + Code Viewer | ✅ Done | plan-integrated-devtools-phase1.md | Embed terminal in session, CodeMirror file viewer |
| 2 | Diff Viewer Tab | ✅ Done | plan-integrated-devtools-phase2.md | Sidebar tab showing all file changes per session |
| 3 | Multi-Session Layout | ✅ Done | plan-integrated-devtools-phase3.md | Split-pane, layout presets, keyboard shortcuts |

## Key Decisions

- **3 phases, not 4** — terminal + code viewer are independent but small, bundled into Phase 1
- **CodeMirror 6 over Monaco** — 20x lighter (~48KB vs ~1MB), sufficient for read-only + light viewing
- **Terminal is interactive** — full PTY (already implemented via `Bun.spawn`), not read-only output
- **All components lazy-loaded** — dynamic import with `ssr: false`, zero impact on initial load
- **Reuse InlineDiff** — Phase 2 diff tab aggregates existing InlineDiff per modified file, not a new diff engine

## Architecture

```
Session View (after all phases)
  ├── Header (badges, model selector, terminal toggle)
  ├── Context Status Bar
  ├── Main Content (resizable split)
  │   ├── Chat (message feed, existing)
  │   └── Terminal (bottom panel, collapsible)
  ├── Composer
  └── Right Sidebar (300px, tabs)
      ├── Stats (existing)
      ├── Files (existing file tree + CodeMirror viewer)
      └── Changes (new — aggregated diffs per session)
```
