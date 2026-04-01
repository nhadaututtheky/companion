# Phase 3: User Controls — Tune What AI Sees

## Goal
Give power users control over context injection — toggle on/off, exclude paths, adjust relevance.

## Tasks
- [ ] Settings tab UI:
  - Toggle: "Enable context injection" (global on/off per project)
  - Toggle per injection type: project_map, message_context, plan_review, break_check
  - Exclude paths pattern list (e.g., `**/test/**`, `**/node_modules/**`)
  - Max token budget slider (default 800 for message context)
- [ ] Server: persist settings in `code_files` or new `codegraph_config` table per project
- [ ] Server: read config before each injection point, respect toggles and excludes
- [ ] UI: "Re-index" button that clears graph + full rescan

## Acceptance Criteria
- [ ] Toggling injection off stops context from being injected
- [ ] Exclude patterns remove files from scan results
- [ ] Settings persist across server restarts
- [ ] Token budget respected in message context injection

## Files Touched
- `packages/server/src/codegraph/agent-context-provider.ts` — read config, apply filters
- `packages/server/src/codegraph/scanner.ts` — respect exclude patterns
- `packages/server/src/db/schema.ts` — new config table (if needed)
- `packages/web/src/components/panels/codegraph-panel.tsx` — Settings tab

## Dependencies
- Phase 1 complete (tab structure)
