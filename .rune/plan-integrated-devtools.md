# Integrated Dev Tools — Master Plan

> Goal: Add terminal, code editor, and diff viewer to session UI
> Priority: P1 — competitive parity with Vibe Companion
> Estimated phases: 3

## Why

Vibe Companion ships xterm.js terminal + CodeMirror editor + diff viewer.
Users currently must switch to external tools to see code/terminal output.
These are table-stakes features for a Claude Code web wrapper.

## Tech stack chosen

| Tool | Package | Size (gzip) | Why |
|------|---------|-------------|-----|
| Terminal | `@xterm/xterm` + `@xterm/addon-fit` | ~82 KB | Industry standard, real PTY support |
| Code viewer | `@uiw/react-codemirror` (CodeMirror 6) | ~48 KB + ~280 KB deps | 20x lighter than Monaco, sufficient for read-only + light edit |
| Diff viewer | `react-diff-viewer-continued` | ~37 KB | React 19 explicit support, clean UI |

All 3 need `dynamic(() => import(...), { ssr: false })` in Next.js.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Terminal panel | ⬚ Pending | plan-devtools-phase1.md | xterm.js component, WebSocket PTY bridge, session tab |
| 2 | Code viewer | ⬚ Pending | plan-devtools-phase2.md | CodeMirror read-only viewer, replace current FileViewer <pre>, syntax highlight |
| 3 | Diff viewer | ⬚ Pending | plan-devtools-phase3.md | Show file diffs inline when agent modifies files, before/after comparison |

## Key decisions

- Terminal runs server-side PTY via `node-pty` or Bun equivalent, streams over WebSocket `/ws/terminal/:sessionId`
- Code viewer reuses FileViewer component — upgrade from `<pre>` to CodeMirror
- Diff viewer triggered from file modification events — show original vs modified
- All components lazy-loaded (code splitting) — zero impact on initial page load

## Architecture

```
Session View (existing)
  ├── Chat tab (existing message feed)
  ├── Terminal tab (new — xterm.js)
  ├── Files tab (existing FileTree + upgraded CodeMirror viewer)
  └── Diff tab (new — shows changes per turn)
```

## Phases (updated)

| # | Name | Status | Summary |
|---|------|--------|---------|
| 1 | Terminal panel | Pending | xterm.js component, WebSocket PTY bridge, session tab |
| 2 | Code viewer | Pending | CodeMirror read-only viewer, replace FileViewer pre, syntax highlight |
| 3 | Diff viewer | Pending | Show file diffs inline when agent modifies files |
| 4 | Multi-Session Layout | Pending | Split-pane, grid/columns/tabs presets, keyboard shortcuts |

### Phase 4: Multi-Session Layout (from 1DevTool analysis)

**Goal**: Allow users to view multiple sessions side-by-side with flexible layout options.

**Tasks**:
- [ ] Install split-pane library (`react-resizable-panels` or `allotment`) — lightweight, React 19 compatible
- [ ] Create `LayoutManager` component with layout state — `packages/web/src/components/layout/layout-manager.tsx` (new)
- [ ] Layout presets:
  - Single (default) — one session full-width
  - Side-by-side (2-up horizontal)
  - Stacked (2-up vertical)
  - Grid (2x2 for 4 sessions)
  - Tabs (all sessions as tabs, one visible at a time)
- [ ] Layout selector in toolbar — `packages/web/src/components/layout/layout-selector.tsx` (new)
- [ ] Keyboard shortcuts: Ctrl+1 single, Ctrl+2 side-by-side, Ctrl+3 stacked, Ctrl+4 grid
- [ ] Per-pane independent zoom (font size control per session pane)
- [ ] Drag sessions between panes to reorder
- [ ] Persist layout preference in settings store
- [ ] Responsive: collapse to single-pane on mobile/narrow viewports

**Dependencies**: Phases 1-3 should be done first (terminal + code viewer make multi-pane useful).

## Verdict gate

Phase 1 (terminal): Do sessions need interactive shell? Or just read-only output display?
→ If read-only output: skip PTY bridge, just stream CLI stderr/stdout into xterm renderer.
→ If interactive: need full PTY bridge (more complex, higher value).
