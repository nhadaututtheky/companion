# Phase 12: Feature Registry & Documentation Fixes

## Goal
Update FEATURE_REGISTRY.md to reflect actual codebase state — add 19 missing services, fix RTK strategy count.

## Tasks
- [ ] Fix RTK strategy count: "8 strategies" → "10 strategies"
- [ ] Add missing service files to appropriate registry sections
- [ ] Add cli-debate-engine.ts to Debate section
- [ ] Add context-budget, context-estimator to Context Intelligence section
- [ ] Add dispatch-router, task-classifier to Smart Orchestration section
- [ ] Add ws-* infrastructure files to WebSocket section
- [ ] Add remaining utility/workspace files
- [ ] Verify all entries against actual file existence

## Acceptance Criteria
- [ ] RTK count matches actual (10)
- [ ] All 19 previously-missing services documented
- [ ] No phantom entries (all referenced files exist)

## Files Touched
- `FEATURE_REGISTRY.md` — modify

## Dependencies
- None (standalone docs fix)
