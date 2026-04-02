# Phase 1: Session Terminal + Code Viewer Upgrade

## Goal

Add terminal tab to session view and upgrade FileViewer from `<pre>` to syntax-highlighted CodeMirror. These two are independent but belong together as "dev tools in session."

## Context

- **Terminal**: `TerminalPanel` already exists at `packages/web/src/components/panels/terminal-panel.tsx` with full xterm.js + WS bridge. Currently only used on the dashboard page (`page.tsx`). Server already has `/ws/terminal/:id` endpoint and `terminal-manager.ts`. **Just need to embed it in session view.**
- **Code Viewer**: `FileViewer` at `packages/web/src/components/session/file-viewer.tsx` uses plain `<pre>` tags. Need to replace with CodeMirror 6 for syntax highlighting.
- **xterm deps already installed**: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- **No CodeMirror installed yet** — need `@uiw/react-codemirror` + language extensions

## Tasks

### 1A. Session Terminal Tab
- [ ] Add "Terminal" tab button to `session-page-client.tsx` header (next to existing badges)
- [ ] Import `TerminalPanel` (dynamic import, SSR disabled)
- [ ] Add toggle state for terminal visibility
- [ ] Render terminal in a resizable bottom panel (below message feed, above composer)
- [ ] Pass `session.state.cwd` as `defaultCwd` to terminal
- [ ] Keyboard shortcut: `` Ctrl+` `` to toggle terminal
- [ ] Terminal should NOT auto-spawn — only when user opens the tab

### 1B. CodeMirror File Viewer
- [ ] Install `@uiw/react-codemirror` + language packs: `@codemirror/lang-javascript`, `@codemirror/lang-python`, `@codemirror/lang-rust`, `@codemirror/lang-json`, `@codemirror/lang-css`, `@codemirror/lang-html`, `@codemirror/lang-markdown`
- [ ] Create `packages/web/src/components/session/code-viewer.tsx` — wrapper around CodeMirror
  - Read-only mode (`editable: false`, `readOnly: true`)
  - Dark/light theme from CSS vars
  - Language auto-detect from file extension
  - Line numbers enabled
  - Word wrap toggle
  - Keep Copy + Send to AI buttons
- [ ] Replace `<pre>` in `file-viewer.tsx` with `<CodeViewer>` (dynamic import)
- [ ] Markdown files still use `<MarkdownMessage>` (no change)

## Files Touched

- `packages/web/src/app/sessions/[id]/session-page-client.tsx` — modify (add terminal toggle)
- `packages/web/src/components/session/code-viewer.tsx` — new
- `packages/web/src/components/session/file-viewer.tsx` — modify (replace pre with CodeViewer)
- `packages/web/package.json` — modify (add CodeMirror deps)

## Acceptance Criteria

- [ ] Terminal opens in session view via button or Ctrl+` shortcut
- [ ] Terminal connects to server, interactive shell works
- [ ] Terminal uses session's cwd as default directory
- [ ] File viewer shows syntax-highlighted code for TS/JS/Python/Rust/JSON/CSS/HTML
- [ ] File viewer remains performant for files up to 5000 lines
- [ ] Both components lazy-loaded (no impact on initial page load)
- [ ] `bun run build` passes
