# Phase 3: Wiki KB Web UI

## Goal
Build the web interface for Wiki KB: browse domains, read/edit articles, drop raw material,
trigger compilation, and visualize knowledge structure.

## Design Direction
- New **sidebar panel** (like File Explorer, Terminal, CodeGraph) — not a Settings tab
- Wiki is a workspace tool, not a configuration
- Panel has 3 views: Browse, Article Reader, Raw Drop Zone

## Tasks

### A. Wiki Panel Component
- [ ] `packages/web/src/components/panels/wiki-panel.tsx`
  - Left sidebar: domain list + article tree
  - Main area: article reader (markdown rendered)
  - Header: domain selector dropdown + search bar + compile button
- [ ] Domain list view:
  - Show all domains with article count + total tokens
  - "New Domain" button → modal with name + description
- [ ] Article tree view:
  - `_core.md` pinned at top with shield icon
  - Articles sorted by last compiled date
  - Token count badge on each article
  - Tags shown as small chips

### B. Article Reader/Editor
- [ ] Markdown renderer for article content (reuse existing markdown component)
- [ ] "Edit" toggle → textarea with live preview
  - Only for manual tweaks — compiler is primary author
- [ ] Frontmatter displayed as metadata bar (compiled_from, compiled_at, tokens)
- [ ] "Recompile" button on individual articles

### C. Raw Drop Zone
- [ ] "Add Knowledge" tab/section in wiki panel
  - Drag-and-drop zone for files (.md, .txt, .pdf, .json)
  - URL paste → auto-fetch content (uses WebIntel if Pro, basic fetch if Free)
  - Text paste → save as raw file
- [ ] Raw file list with preview
- [ ] "Compile All" button → triggers `/api/wiki/:domain/compile`
- [ ] Compilation progress indicator (streaming status)

### D. Panel Registration
- [ ] Add wiki panel to panel registry (alongside terminal, files, codegraph)
- [ ] Panel icon: BookOpen or Notebook from Phosphor
- [ ] Default width: 480px (same as file explorer, search)

### E. Context Breakdown Enhancement
- [ ] Update `ai-context-panel.tsx` to show wiki sources in breakdown
- [ ] Show which wiki articles are currently loaded in session
- [ ] "View in Wiki" link from context panel → opens wiki panel to that article

## Acceptance Criteria
- [ ] Can browse all domains and articles in wiki panel
- [ ] Can read articles with rendered markdown
- [ ] Can drag-and-drop files into raw zone
- [ ] Can paste URLs/text as raw material
- [ ] Can trigger compilation and see progress
- [ ] Can manually edit articles (with "edited manually" flag)
- [ ] Panel integrates with existing layout system
- [ ] Wiki panel accessible from panel toolbar

## Files Touched
- `packages/web/src/components/panels/wiki-panel.tsx` — new
- `packages/web/src/components/panels/wiki-article-view.tsx` — new
- `packages/web/src/components/panels/wiki-raw-dropzone.tsx` — new
- `packages/web/src/lib/stores/wiki-store.ts` — new (Zustand store)
- `packages/web/src/lib/api-client.ts` — modify (add wiki API methods)
- `packages/web/src/components/panels/ai-context-panel.tsx` — modify
- Layout/panel registry files — modify

## Dependencies
- Phase 1 complete (API endpoints)
- Phase 2 complete (budget integration for context panel)
