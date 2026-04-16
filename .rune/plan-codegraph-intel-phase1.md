# Phase 1: Wire Zombie Connections

## Goal
Fix 4 disconnected feature chains that already have code on both ends but no wire between them. Zero new algorithms — just plumbing.

## Tasks
- [ ] Wire PostToolUse hook → event-collector — `ws-permission-handler.ts` handleHookEvent() should call `eventCollector.processToolEvent()` for PostToolUse events (Read, Edit, Write, Bash)
- [ ] Wire communities → context injection — `agent-context-provider.ts` buildProjectMap() should include top communities from `analysis.detectCommunities()` in project map context
- [ ] Wire codegraph → wiki cross-reference — when wiki retriever searches, also search codegraph symbols for code-related queries; add `relatedSymbols` field to wiki query results
- [ ] Wire session summary → wiki auto-compile — after `saveSessionFindings()` saves raw file, trigger `compileIfStale()` on the domain to auto-compile new raw material into articles

## Acceptance Criteria
- [ ] PostToolUse events from Claude Code sessions appear in event-collector activity log in real-time
- [ ] Project map context includes community clusters (e.g., "Auth cluster: 12 symbols, cohesion 0.85")
- [ ] Wiki search for "authentication" returns both wiki articles AND related codegraph symbols
- [ ] Session end → raw saved → articles auto-compiled without manual "Compile" button

## Files Touched
- `packages/server/src/services/ws-permission-handler.ts` — modify handleHookEvent()
- `packages/server/src/codegraph/agent-context-provider.ts` — modify buildProjectMap()
- `packages/server/src/codegraph/analysis.ts` — ensure detectCommunities() is importable
- `packages/server/src/wiki/retriever.ts` — add codegraph symbol search fallback
- `packages/server/src/wiki/feedback.ts` — add auto-compile after raw save
- `packages/server/src/codegraph/event-collector.ts` — ensure processToolEvent() handles hook event format

## Dependencies
- None (all code already exists, just disconnected)
