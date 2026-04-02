# Phase 1: Unified AI Context Panel

## Goal
Merge CodeGraph + WebIntel into one "AI Context" panel. Fix dead-end UX.
Show users what AI context sources are active and what gets injected.

## Current Architecture (Reference)

### UI Components
- `packages/web/src/components/panels/codegraph-panel.tsx` (480 lines)
  - Default export: `CodeGraphPanel`
  - Props: `{ onClose, projectSlug? }`
  - State: ready, scanning, job, stats, hotFiles, searchQuery, searchResults
  - Sub-components: StatusBadge, ScanProgress, StatsCard, HotFilesList, SearchResults
  - Polling: 3s (scanning) / 15s (idle)

- `packages/web/src/components/panels/webintel-panel.tsx` (482 lines)
  - Named export: `WebIntelPanel`
  - Props: `{ onClose }`
  - State: status, loading, error, clearing
  - Sub-components: StatusBadge, CacheStats, QuickScrape, QuickResearch
  - Polling: 15s constant

### Panel Rendering
- `packages/web/src/app/page.tsx` — Lines 756-763: renders both panels conditionally
  - `rightPanelMode === "webintel"` → `<WebIntelPanel />`  (width: 400px)
  - `rightPanelMode === "codegraph"` → `<CodeGraphPanel />` (width: 380px)

### Header Buttons
- `packages/web/src/components/layout/header.tsx`
  - Line ~226-237: WebIntel button (CloudArrowDown, yellow #FBBC04)
  - Line ~238-249: CodeGraph button (Graph, purple #A855F7)
  - Both toggle via `setRightPanelMode()`

### Store
- `packages/web/src/lib/stores/ui-store.ts` — Line 8-16:
  - `rightPanelMode` includes `"webintel" | "codegraph"`
  - Union type repeated at line 27

### API Client
- `packages/web/src/lib/api-client.ts`
  - Lines ~796-849: `api.webintel.*` (status, scrape, docs, search, research, crawl, jobs, clearCache)
  - Lines ~852-928: `api.codegraph.*` (status, stats, scan, rescan, describe, cancel, search, hotFiles, impact, reverseDeps)

### Server-Side Injection (no changes needed)
- `packages/server/src/codegraph/agent-context-provider.ts`
  - `buildProjectMap()` — ~1500 tokens at session start
  - `buildMessageContext()` — ~800 tokens per message
  - `reviewPlan()` — warns about breaking changes
  - `checkBreaks()` — validates export removals

- `packages/server/src/services/ws-bridge.ts`
  - Lines 408-417: CodeGraph project map injected at session init
  - Lines 2084-2094: CodeGraph message context per-message
  - Lines 2118-2188: WebIntel auto-inject library docs (detectLibraryMentions → resolveDocsUrl → scrapeForContext)
  - Max 2 libs/message, ~4000 tokens, tracked in session.webIntelInjected Set

## Tasks

### 1. Update ui-store (5 min)
- [ ] File: `packages/web/src/lib/stores/ui-store.ts`
  - Replace `"webintel" | "codegraph"` with `"ai-context"` in type union (lines 8-16 AND 27)
  - Both occurrences of the union type must be updated

### 2. Create AI Context Panel (main work)
- [ ] File: `packages/web/src/components/panels/ai-context-panel.tsx` — NEW
  - Named export: `AiContextPanel`
  - Props: `{ onClose: () => void; projectSlug?: string }`
  - **Header**: Brain icon (Phosphor), "AI Context" title, close button
  - **Project selector**: dropdown from `GET /api/projects`, default to props.projectSlug, persist in localStorage
  - **3 Source Status Cards** (row at top):
    - 🟢 Codebase: scan ready? node/edge counts. Click → expand stats. "Scan" button if no scan.
    - 🟡 Docs: webclaw online? N libs auto-injected. Click → expand cache stats. "Start" hint if offline.
    - 🔵 Web Search: API key configured? Optional badge.
  - **Tabs**: Explore (default) | Feed (placeholder "Coming in Phase 2")
  - **Explore tab** content (merge from both panels):
    - CodeGraph search bar + results (from codegraph-panel SearchResults)
    - Hot files list (from codegraph-panel HotFilesList)
    - Quick Scrape input (from webintel-panel QuickScrape)
    - Quick Research input (from webintel-panel QuickResearch)
  - **Polling**: unified — 3s while scanning, 15s idle
  - Width: 420px

### 3. Update Header (10 min)
- [ ] File: `packages/web/src/components/layout/header.tsx`
  - Remove WebIntel button (CloudArrowDown, ~line 226-237)
  - Remove CodeGraph button (Graph, ~line 238-249)
  - Add single "AI Context" button: Brain icon, color #A855F7, toggles `"ai-context"`

### 4. Update page.tsx panel rendering (10 min)
- [ ] File: `packages/web/src/app/page.tsx`
  - Remove imports: `WebIntelPanel`, `CodeGraphPanel` (lines 19-20)
  - Add import: `AiContextPanel` from new file
  - Replace width logic (lines 716-723): `rightPanelMode === "ai-context" ? 420 : ...`
  - Replace render blocks (lines 756-763): single `{rightPanelMode === "ai-context" && <AiContextPanel ... />}`
  - Pass projectSlug from active session

### 5. Delete old panels (2 min)
- [ ] Delete: `packages/web/src/components/panels/webintel-panel.tsx`
- [ ] Delete: `packages/web/src/components/panels/codegraph-panel.tsx`
- [ ] Verify no remaining imports via grep

### 6. Lint + verify (5 min)
- [ ] `bun run lint` — 0 errors
- [ ] `bun run format`
- [ ] `bun run check` — TypeScript passes

## Acceptance Criteria
- [ ] Single "AI Context" button in header opens unified panel
- [ ] Panel works without active session — project dropdown functional
- [ ] 3 source cards show correct status (codebase, docs, web search)
- [ ] Explore tab has codegraph search + hot files + webintel scrape/research
- [ ] Old panels deleted, no dead references
- [ ] Server-side injection unchanged (zero backend changes)

## Files Touched
| File | Action |
|------|--------|
| `packages/web/src/lib/stores/ui-store.ts` | Modify — replace panel modes |
| `packages/web/src/components/panels/ai-context-panel.tsx` | **New** — unified panel |
| `packages/web/src/components/layout/header.tsx` | Modify — merge 2 buttons → 1 |
| `packages/web/src/app/page.tsx` | Modify — swap panel rendering |
| `packages/web/src/components/panels/codegraph-panel.tsx` | **Delete** |
| `packages/web/src/components/panels/webintel-panel.tsx` | **Delete** |

## Dependencies
- Existing APIs: `/api/projects`, `/codegraph/*`, `/webintel/status`
- No backend changes needed
- No new packages needed
