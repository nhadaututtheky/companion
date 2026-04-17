# Phase 4: Auto-Reindex + Claude Code Skills Generation

## Goal
Two connected features: (1) auto-reindex the code graph after file changes via PostToolUse hooks, and (2) auto-generate `.claude/skills/` files from codegraph data so Claude Code sessions start with project-aware capabilities.

## Tasks

### Auto-Reindex
- [x] Debounced reindex trigger — when PostToolUse hook reports Edit/Write on a tracked file, queue an incremental rescan (debounce 5s to batch rapid edits)
  - Use existing `incrementalRescan()` from diff-updater.ts
  - Only rescan changed files (not full project)
  - Skip if scan already in progress (mutex)
- [x] Add reindex stats to activity feed — "Graph updated: 3 symbols changed in auth.ts"
- [x] Expose toggle in codegraph config: `autoReindexEnabled` (default: true)

### Claude Code Skills Generation
- [x] Create `codegraph/skills-generator.ts` — generates project-specific Claude Code skills:
  - `exploring.md` — "When exploring this codebase, use these entry points: [hot files], architecture: [communities]"
  - `debugging.md` — "Key error-handling patterns: [extracted from graph], common failure points: [high-coupling nodes]"
  - `impact-check.md` — "Before committing, run companion_codegraph_diff_impact to check blast radius"
  - `wiki-note.md` — "After discovering patterns, save to wiki: companion_wiki_note(domain, content)"
- [x] REST endpoint `POST /codegraph/generate-skills` — generates and writes skills to project dir
- [x] MCP tool `companion_generate_skills` — agent can self-provision skills
- [x] Auto-generate on first scan completion (if project has .claude/ directory)
- [x] Skills reference MCP tools by name so Claude Code can call them

## Acceptance Criteria
- [x] File edits during session trigger automatic graph reindex within 5s
- [x] `.claude/skills/companion-exploring.md` generated with project-specific content
- [x] Skills contain actionable MCP tool references (not just descriptions)
- [x] Toggle to disable auto-reindex works
- [x] Skills auto-generated after first scan if .claude/ exists

## Files Touched
- `packages/server/src/services/ws-permission-handler.ts` — enhance PostToolUse handler to trigger reindex
- `packages/server/src/codegraph/diff-updater.ts` — add debounced reindex queue
- `packages/server/src/codegraph/skills-generator.ts` — new
- `packages/server/src/codegraph/config.ts` — add autoReindexEnabled
- `packages/server/src/routes/codegraph.ts` — add generate-skills endpoint
- `packages/server/src/mcp/tools.ts` — add MCP tool

## Dependencies
- Phase 1 (PostToolUse → event-collector wired)
- Phase 3 (impact-analyzer for impact-check skill)
