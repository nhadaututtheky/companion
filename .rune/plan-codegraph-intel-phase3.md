# Phase 3: Git Diff Impact Mapping

## Goal
Before commits, analyze which execution flows and dependent files are affected by staged changes. Connects existing `diff-updater.ts` + `analysis.ts` impact radius into a coherent pre-commit analysis pipeline. GitNexus's killer feature — port it.

## Tasks
- [ ] Create `codegraph/impact-analyzer.ts` — orchestrator that combines:
  - `diff-updater.getGitDiff()` to get changed files
  - `analysis.getImpactRadius()` for each changed file (forward deps)
  - `analysis.getReverseDependencies()` for each changed file (who depends on us)
  - Community membership (which clusters are affected)
  - Risk scoring: high (core util changed, 10+ dependents), medium (3-9), low (<3)
- [ ] Add REST endpoint `POST /codegraph/impact-analysis` — accepts optional `{ files?: string[], diff?: string }`, defaults to `git diff --staged`
  - Returns: affected files, risk score, communities impacted, suggested review areas
- [ ] Add MCP tool `companion_codegraph_diff_impact` — pre-commit analysis for agents
  - Input: projectSlug, optional file list
  - Output: structured impact report
- [ ] Wire to break check — enhance `checkBreaks()` to use impact-analyzer for richer warnings
  - Current: only checks removed exports
  - New: also checks modified function signatures, added/removed parameters
- [ ] Add Telegram command `/impact` — quick impact check from Telegram before committing

## Acceptance Criteria
- [ ] `POST /codegraph/impact-analysis` returns risk-scored impact report
- [ ] MCP tool works: Claude can ask "what's the blast radius of my changes?"
- [ ] Break check enriched with signature change detection
- [ ] `/impact` in Telegram shows affected files + risk level

## Files Touched
- `packages/server/src/codegraph/impact-analyzer.ts` — new
- `packages/server/src/codegraph/agent-context-provider.ts` — enrich checkBreaks()
- `packages/server/src/routes/codegraph.ts` — add endpoint
- `packages/server/src/mcp/tools.ts` — add MCP tool
- `packages/server/src/telegram/commands/utility.ts` — add /impact command

## Dependencies
- Phase 2 (community labels for "which clusters are affected")
