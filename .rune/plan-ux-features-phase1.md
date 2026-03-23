# Phase 1: Power Tools (Full-text Search, Terminal, Multi-tab Viewer)

## Goal
Deliver the three highest-impact developer tools: project-wide file search, an interactive terminal panel, and multi-tab file viewing with tab management.

## Status: ✅ DONE

---

## Task 1: Full-text Search (Ctrl+Shift+F) — ✅ Done

### Server
- [x] Add `GET /api/fs/search?q=<query>&path=<dir>&glob=<pattern>` to `filesystem.ts`
- [x] Spawn `rg --json` child process, parse NDJSON results
- [x] Return `{ data: { matches, total, truncated } }`
- [x] Limit to 200 results, timeout 10s, validate path with existing `validateDir`

### Web
- [x] Create `search-panel.tsx` in `components/panels/`
- [x] Search input (debounced 300ms) + glob filter input + results list
- [x] Each result shows `file:line` with context snippet, click opens file in viewer
- [x] Add `rightPanelMode: "search"` option to `ui-store.ts`
- [x] Register `Ctrl+Shift+F` shortcut in `command-palette-provider.tsx`
- [x] Add `api.fs.search()` method to `api-client.ts`

---

## Task 2: Interactive Terminal (xterm.js + Bun.spawn) — ✅ Done

### Server
- [x] Create `terminal-manager.ts` service using Bun.spawn
- [x] Create `terminal.ts` route — `POST /api/terminal` to spawn shell
- [x] Add WS endpoint `/ws/terminal/:id` in main Bun.serve handler
- [x] Bridge stdin/stdout/resize between WS and spawn process
- [x] Clean up process on WS disconnect or explicit DELETE

### Web
- [x] Install `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links`
- [x] Create `terminal-panel.tsx` with dynamic xterm import
- [x] Connect to `/ws/terminal/:id`, pipe data to xterm instance
- [x] Handle resize (addon-fit), send resize events to server
- [x] Add `rightPanelMode: "terminal"` to `ui-store.ts`
- [x] Add terminal icon button in header

---

## Task 3: Multi-tab File Viewer — ✅ Done

### Web (no server changes)
- [x] Create `file-tabs-store.ts` — manages open tabs array + active tab
- [x] Create `file-tab-bar.tsx` — horizontal tab strip with close buttons
- [x] Refactor `file-explorer-panel.tsx` to use tabs store
- [x] On file click: if tab exists, switch to it; else open new tab
- [x] Middle-click or X button closes tab
