# Phase 2: Agents Provider

## Goal

Add sub-agent suggestions so users discover `Task({subagent_type: X})`
opportunities inline. Parses both user-level agents
(`~/.claude/agents/*.md`) and plugin-provided agents from Claude Code
settings/plugin manifests.

## Tasks

- [ ] Extend `GET /api/registry` with `/agents` endpoint:
  - Parse `~/.claude/agents/*.md` frontmatter (name, description, model, tools)
  - Parse plugins from `~/.claude.json` → for each plugin, look up its agents directory or manifest
  - Return merged list with `source: 'user' | 'plugin:<name>'`
- [ ] Extend `registry-store` with `fetchAgents()` + `agents` slice
- [ ] Create `packages/web/src/lib/suggest/providers/agents.provider.ts`:
  - Load agents from store
  - Match per agent: keywords from `name` + `description` + explicit `suggest_triggers` (if any)
  - Category-based scoring: Explore agents score higher for search-like prompts, Plan agents for design-like prompts
  - Return `Suggestion[]` with `action: { type: 'insert-text', payload: '@agent:<name> ' }` OR `{ type: 'custom', payload: { kind: 'task-template', agent: '<name>' } }`
- [ ] Intent categories in `intent.ts`:
  - `search` — "find", "search", "where", "locate", "look for"
  - `plan` — "plan", "design", "architect", "approach"
  - `debug` — "debug", "error", "fix", "crash", "stack trace"
  - `review` — "review", "audit", "check quality", "lint"
  - `test` — "test", "TDD", "coverage"
- [ ] Register `AgentsProvider` in engine on app mount
- [ ] Unit tests: agent parsing, category detection, keyword matching

## Acceptance Criteria

- [ ] Typing "find all usages of X" surfaces `Explore` agent
- [ ] Typing "design architecture for Y" surfaces `Plan` (or `rune:architect`) agent
- [ ] Typing "debug stack trace" surfaces `rune:debug` agent
- [ ] Plugin agents (from `rune:*`) appear alongside user agents
- [ ] Accept action inserts usable template (not broken syntax)
- [ ] Max 2 agent suggestions per response (don't flood; leave room for other providers)
- [ ] Typecheck clean, 5+ tests pass

## Files Touched

### New
- `packages/web/src/lib/suggest/providers/agents.provider.ts`
- `packages/server/src/lib/registry/parse-agents.ts`
- `packages/web/src/lib/suggest/__tests__/agents.test.ts`

### Modified
- `packages/server/src/routes/registry.ts` — add `/agents` endpoint
- `packages/web/src/lib/suggest/registry-store.ts` — add agents slice
- `packages/web/src/lib/suggest/intent.ts` — category constants
- `packages/web/src/lib/suggest/index.ts` — export provider

## Dependencies

- Phase 1 foundation (engine, store, base intent detector)

## Design notes

**Plugin agent discovery** — settings.json holds enabled plugins. For each plugin:
1. Look in plugin install dir for `agents/*.md`
2. Parse frontmatter (same format as user agents)
3. Namespace the name: `pluginName:agentName`

**Score calibration** — agents score 0.6-0.9 range, leaving 0.9+ for skills (commands are higher-signal than agent suggestions).

**Action format** — two options:
- `insert-text` — insert `@agent:name ` and let user continue typing
- `custom` — emit event, trigger template insertion dialog with full `Task(...)` call

Start with `insert-text` for simplicity. Phase 4 can add template dialog.

## Out of scope

- Agent usage stats (defer to Agents Hub feature, separate plan)
- Recommending agent chains/pipelines (future)
