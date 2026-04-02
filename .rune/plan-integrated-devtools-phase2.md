# Phase 2: Changes Panel (Diff Viewer Tab)

## Goal

Add a "Changes" tab to the session sidebar that aggregates all file diffs from the session, grouped by file path.

## Tasks

- [x] Create `changes-panel.tsx` — extracts Edit/Write diffs from messages, groups by file
- [x] Add tab system to `session-details.tsx` (Overview | Changes)
- [x] Pass `messages` from session page to SessionDetails
- [x] Build passes

## Files Touched

- `packages/web/src/components/session/changes-panel.tsx` — new
- `packages/web/src/components/session/session-details.tsx` — modify (add tabs + ChangesPanel)
- `packages/web/src/app/sessions/[id]/session-page-client.tsx` — modify (pass messages prop)

## Acceptance Criteria

- [x] Changes tab shows all file modifications grouped by file path
- [x] Each file expandable to show InlineDiff for each edit
- [x] Summary shows file count, edit count, new file count
- [x] Empty state when no changes
- [x] Reuses existing InlineDiff component
- [x] Build passes
