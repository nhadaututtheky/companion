# Phase 5: Visual Dependency Graph (Stretch)

## Goal
Optional interactive visualization of codebase dependencies. The "wow factor" feature — but lowest priority since real value is in the invisible injection pipeline.

## Tasks
- [ ] Evaluate lightweight graph libraries: `@xyflow/react` (React Flow) or `d3-force`
- [ ] Build graph view component: nodes = files/symbols, edges = dependencies
- [ ] Color coding: by module, by coupling score, by change frequency
- [ ] Click node → show symbol details + edges
- [ ] Filter: by file type, by module, by edge type
- [ ] Highlight: "impact radius" — select a file, see all files that depend on it
- [ ] Integration: accessible from Explore tab in AI Context panel

## Acceptance Criteria
- [ ] Interactive graph renders for projects with <500 nodes
- [ ] Performance acceptable (60fps pan/zoom)
- [ ] Click interactions work
- [ ] Large projects show warning + offer filtered view

## Files Touched
- New: `packages/web/src/components/panels/graph-visualization.tsx`
- `packages/web/src/components/panels/ai-context-panel.tsx` — add Graph sub-tab
- `package.json` — add graph library dep

## Dependencies
- Phase 1 complete
- CodeGraph scan data available
