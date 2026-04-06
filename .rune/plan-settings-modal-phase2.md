# Phase 2: Skills API + Tree UI

## Goal
Add GET /api/skills endpoint to discover skills from filesystem. Add a "Skills" tab to the settings modal with a tree-folder component (expand/collapse root groups, click leaf to preview markdown).

## Tasks
- [ ] Create packages/server/src/routes/skills.ts — filesystem scanner
- [ ] Register route in packages/server/src/routes/index.ts
- [ ] Create packages/web/src/components/settings/skills-tab.tsx — tree UI
- [ ] Wire SkillsTab into settings-modal.tsx TabContent
- [ ] Test with real .rune/skills and .claude/skills directories

## Acceptance Criteria
- [ ] GET /api/skills returns JSON tree of skill sources + leaves
- [ ] Skills tab renders tree with expand/collapse per root group
- [ ] Click skill leaf → shows markdown content on right pane
- [ ] No crash if skills directories don't exist (empty state)
- [ ] TypeScript compiles clean, build passes

## Files to Create
- `packages/server/src/routes/skills.ts`
- `packages/web/src/components/settings/skills-tab.tsx`

## Files to Modify
- `packages/server/src/routes/index.ts`
- `packages/web/src/components/settings/settings-modal.tsx`
