# Phase 1: Unified AI Context Panel

## Goal
Merge CodeGraph + WebIntel into one panel. Fix dead-end UX. Show users what AI context sources are active.

## Tasks
- [ ] Rename panel: "AI Context" with Brain icon (Phosphor)
- [ ] Replace 2 header buttons (CodeGraph + WebIntel) with 1 "AI Context" button
- [ ] Add project selector dropdown at top
  - Fetch from `GET /api/projects`
  - Default to active session's project if exists
  - Persist last selected in localStorage
- [ ] 3 source status cards at top:
  - **Codebase**: scan status (ready/no scan/scanning), node+edge counts
  - **Docs**: webclaw online/offline, auto-inject status (N libraries detected)
  - **Web Search**: optional badge, API key configured yes/no
- [ ] Each card: click to expand details (current codegraph stats / webintel cache stats)
- [ ] "Scan Project" button (triggers CodeGraph scan)
- [ ] "Start Docs Engine" button (if webclaw offline — show Docker command or auto-start)
- [ ] Tab structure: Feed (default, placeholder) | Explore | Settings (placeholder)
- [ ] Explore tab: merge current codegraph search + hot files + webintel quick scrape
- [ ] Pro-tier badge for CodeGraph injection; WebIntel scrape works on all tiers
- [ ] Delete old `webintel-panel.tsx` after merge

## Acceptance Criteria
- [ ] Single "AI Context" button in header opens unified panel
- [ ] Panel works without active session — project dropdown functional
- [ ] 3 source cards show correct status
- [ ] Explore tab has codegraph search + hot files + webintel scrape
- [ ] Old WebIntel panel removed, no dead references

## Files Touched
- `packages/web/src/components/panels/codegraph-panel.tsx` → rename to `ai-context-panel.tsx`
- `packages/web/src/components/panels/webintel-panel.tsx` → delete after merge
- `packages/web/src/app/page.tsx` — update panel rendering, remove webintel panel
- `packages/web/src/components/layout/header.tsx` — merge 2 buttons into 1
- `packages/web/src/lib/stores/ui-store.ts` — simplify rightPanelMode (remove "webintel"/"codegraph", add "ai-context")
- `packages/web/src/lib/api-client.ts` — may need projects list endpoint

## Dependencies
- Existing APIs: `/api/projects`, `/codegraph/*`, `/webintel/status`
