# Phase 8: Web Claude Code Parity

## Goal
Bring web terminal closer to Claude Code CLI experience — rich message rendering, tool display, thinking blocks.

## Tasks
- [ ] Markdown rendering in assistant messages (react-markdown + rehype-highlight)
- [ ] Code blocks with syntax highlighting + copy button + language label
- [ ] Thinking blocks: collapsible "Thinking..." section with expand/collapse
- [ ] Tool use blocks: show tool name + input + output in styled card
- [ ] File tree sidebar: files read/modified/created (from session state)
- [ ] Diff viewer for Edit tool results (inline diff with green/red)
- [ ] Cost per message display (token count + cost)
- [ ] Token counter in session header (input/output breakdown)
- [ ] Session search/filter in sidebar (by name, project, status)

## Acceptance Criteria
- [ ] Markdown renders correctly (headers, lists, bold, links, tables)
- [ ] Code blocks have syntax highlighting for 10+ languages
- [ ] Thinking blocks collapse by default, expandable on click
- [ ] Tool use displays are informative but not overwhelming
- [ ] File tree updates in real-time as Claude reads/modifies files
- [ ] Performance: rendering 500+ messages doesn't lag (virtualization)

## Files Touched
- `packages/web/src/components/session/message-renderer.tsx` — new or major modify
- `packages/web/src/components/session/code-block.tsx` — new
- `packages/web/src/components/session/thinking-block.tsx` — new
- `packages/web/src/components/session/tool-use-block.tsx` — new
- `packages/web/src/components/session/file-tree.tsx` — new
- `packages/web/src/components/session/diff-viewer.tsx` — new
- `packages/web/package.json` — add react-markdown, rehype-highlight deps

## Dependencies
- Phases 1-6 (session infrastructure must be stable)
