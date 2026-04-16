# Phase 3: Git Diff Impact Mapping

## Goal
Before commits, analyze which execution flows and dependent files are affected by staged changes. Connects existing `diff-updater.ts` + `analysis.ts` impact radius into a coherent pre-commit analysis pipeline. GitNexus-inspired feature.

## Tasks
- [x] Create `codegraph/impact-analyzer.ts` — orchestrator combining diff, impact, deps, communities, risk
- [x] Add REST endpoint `POST /codegraph/impact-analysis` — accepts files/projectDir/since
- [x] Add MCP tool `companion_codegraph_diff_impact` — pre-commit analysis for agents
- [x] Enhance `checkBreaks()` — includes signatures, risk levels, sorted by dependent count
- [x] Add Telegram command `/impact` — quick impact check with colored risk indicators

## Acceptance Criteria
- [x] `POST /codegraph/impact-analysis` returns risk-scored impact report
- [x] MCP tool works: Claude can ask "what's the blast radius of my changes?"
- [x] Break check enriched with signature info + risk categorization
- [x] `/impact` in Telegram shows affected files + risk level + review suggestions

## Files Touched
- `packages/server/src/codegraph/impact-analyzer.ts` — new (~200 LOC)
- `packages/server/src/codegraph/agent-context-provider.ts` — enhanced checkBreaks()
- `packages/server/src/routes/codegraph.ts` — POST endpoint
- `packages/server/src/mcp/tools.ts` — MCP tool
- `packages/server/src/telegram/commands/utility.ts` — /impact command

## Dependencies
- Phase 2 (community labels for "which clusters are affected")
