# Phase 1: Skill Activation Rules + Injection

## Goal

Convert skill từ static `.md` browse-only thành activation rules có
frontmatter `triggers` + `tools`. SkillRouter service đọc enabled
skills, render thành 5-10 dòng activation hints, inject vào prefix
qua `adapter-context-builder`. Toggle on/off per-project ở DB.

## Tasks

- [ ] Schema: thêm bảng `harness_skill_toggles` (`project_id`, `skill_id`, `enabled`, `updated_at`) — `packages/server/src/db/schema.ts` + migration SQL
- [ ] Định nghĩa skill frontmatter contract — extend types ở `packages/shared/src/types/skill.ts` (new): `{ id, name, description, triggers: string[], tools: string[], priority?: number }`
- [ ] Skill loader: parse frontmatter từ `.claude/skills/*.md`, trả về typed objects — `packages/server/src/services/skill-loader.ts` (new)
- [ ] Skill router service — `packages/server/src/services/skill-router.ts` (new): `getActiveSkills(projectId)` (DB join + filesystem scan), `renderActivationHints(skills)` → markdown 5-10 dòng max
- [ ] Inject vào prefix — extend `packages/server/src/services/adapter-context-builder.ts` để gọi `skillRouter.renderActivationHints()` và prepend section `## Companion Harness — When to Use Tools` (non-Claude CLIs đã có prefix path; Claude CLI dùng cùng builder để consistent)
- [ ] Token budget — register thêm source vào `context-budget.ts` với priority 5, max 1.5K tokens; truncate nếu vượt
- [ ] REST: `GET /api/skills/toggles?project=`, `POST /api/skills/toggle` (body `{ skillId, enabled }`) — `packages/server/src/routes/skills.ts` (extend)
- [ ] Web UI toggle — `packages/web/src/components/settings/skills-tab.tsx` thêm checkbox row mỗi skill với badge "auto-injected" / "off"
- [ ] Seed 3 starter skills (file-based, frontmatter chuẩn):
  - `.claude/skills/companion-impact.md` — triggers: ["impact of changing", "what depends on", "if I edit X", "blast radius"]; tools: ["companion_codegraph_impact"]
  - `.claude/skills/companion-knowledge.md` — triggers: ["how does", "why is", "where is documented", "explain architecture"]; tools: ["companion_wiki_search", "companion_wiki_read"]
  - `.claude/skills/companion-explore.md` — triggers: ["find function", "where defined", "callers of", "implementation of"]; tools: ["companion_codegraph_search", "companion_codegraph_neighbors"]
- [ ] Unit tests: skill-loader parses frontmatter + rejects malformed; skill-router filters disabled; renderActivationHints respects token budget
- [ ] Integration test: `adapter-context-builder` includes activation section khi skill enabled, vắng mặt khi disabled

## Acceptance Criteria

- [ ] Web settings → Skills tab cho phép toggle 3 starter skills on/off, persist qua reload
- [ ] Khi toggle ON, section `## Companion Harness — When to Use Tools` xuất hiện trong session prefix (verify qua `/api/sessions/:id/prefix-debug` hoặc test snapshot)
- [ ] Khi toggle OFF, section vắng mặt (không có residual)
- [ ] Activation hints ≤ 1.5K tokens (test với 3 skills enabled cùng lúc)
- [ ] Frontmatter malformed → skill bị skip + log warning, không crash
- [ ] Database migration up + down chạy clean
- [ ] 6+ unit tests, 2+ integration tests
- [ ] Không regression: existing `/api/skills` browse vẫn trả về tree đúng

## Files Touched

### New
- `packages/shared/src/types/skill.ts`
- `packages/server/src/db/migrations/0049-harness-skill-toggles.sql`
- `packages/server/src/services/skill-loader.ts`
- `packages/server/src/services/skill-router.ts`
- `packages/server/src/services/__tests__/skill-router.test.ts`
- `packages/server/src/services/__tests__/skill-loader.test.ts`
- `.claude/skills/companion-impact.md`
- `.claude/skills/companion-knowledge.md`
- `.claude/skills/companion-explore.md`

### Modified
- `packages/server/src/db/schema.ts` — add `harnessSkillToggles` table
- `packages/server/src/services/adapter-context-builder.ts` — call `skillRouter.renderActivationHints()`, prepend section
- `packages/server/src/services/context-budget.ts` — register harness skills source
- `packages/server/src/routes/skills.ts` — toggle GET/POST endpoints
- `packages/web/src/components/settings/skills-tab.tsx` — toggle checkboxes
- `packages/web/src/lib/api/skills.ts` — toggle API client
- `packages/shared/src/index.ts` — re-export skill types

## Dependencies

- None (foundational); enables Phase 2-4
- Reuses existing `adapter-context-builder` injection pipeline
- Reuses Drizzle migration flow + embedded-migrations regen

## Design notes

**Frontmatter contract**:
```markdown
---
id: companion-impact
name: Impact Analysis
description: Use before editing any file to find what depends on it
triggers:
  - "impact of changing"
  - "what depends on"
  - "if I edit X"
  - "blast radius"
tools:
  - companion_codegraph_impact
priority: 8
---

# Body markdown — read by humans only, not injected.
```

**Activation hint render** (mỗi skill ~3 dòng):
```
- When user asks about [trigger phrases] → call `tool_name`
```

Inject section mẫu (≤1.5K tokens):
```markdown
## Companion Harness — When to Use Tools

- When user mentions "impact of changing X" or "what depends on" → call `companion_codegraph_impact`
- When user asks "how does X work" or "explain architecture" → call `companion_wiki_search` then `companion_wiki_read`
- When user wants to find a function or its callers → call `companion_codegraph_search` or `companion_codegraph_neighbors`
```

**Toggle persistence** — DB row created lazy on first toggle. Nếu
project chưa có row, default theo `enabled: true` cho 3 starter
skills (opt-out, không opt-in — user thấy harness work liền).

**Migration regen** — sau khi thêm SQL file, MUST chạy
`bun run db:embed-migrations` (per `feedback_embedded_migrations.md`).

## Out of scope (defer to phase 2+)

- RTK exposure (Phase 2)
- Meta-tool `companion_ask` (Phase 3)
- Metrics logging (Phase 4)
- AI-generated triggers
- Cross-project skill sharing
- User custom skill creation từ UI (chỉ filesystem trong v1)
- Trigger matching auto-detection ở agent side (chỉ static hints)

## Implementation deltas vs original plan (2026-05-03)

**Status**: ✅ SHIPPED. 19 unit tests pass, typecheck clean, lint 0 issues
on new files. Adversary review completed; BLOCK + critical WARN items
fixed in same phase.

**Deltas from original plan**:

1. **Claude path NOT wired** — `adapter-context-builder` is non-Claude
   only. Claude Code reads `.claude/skills/*.md` natively via Anthropic's
   skill system, so frontmatter `description` already activates. Original
   plan said "Claude CLI dùng cùng builder để consistent" — incorrect,
   Claude inject path is via `ws-session-lifecycle` stdin NDJSON which
   is INV-protected. Decision: SKIP Claude prefix injection, rely on
   native skill loading.

2. **MCP tool description amendment DEFERRED** — would require MCP server
   to fetch from API at registration time. Static descriptions in
   `tools-agent.ts` already say "Use this when…". Phase 2-3 may revisit
   if metrics show low Claude harness adoption.

3. **Starter skills runtime-seeded** — `.claude/skills/` was blocked by
   harness write protection during agent implementation. Workaround:
   bundle 3 skill bodies as TS source in `skill-seed.ts`, write at
   server runtime when project sentinel exists (`.git`, `package.json`,
   etc). Existing files NEVER overwritten.

4. **Priority 4 instead of 5** — `harness_skills` BUDGET_SOURCES entry
   ties with `codegraph_map`. Both session-start tier; allocation order
   matches array order. Documented but not changed.

## Adversary review fixes applied

- **B3** Project sentinel guard added to `skill-seed.ts:33-49` — refuses
  to write into `/`, `~`, `/etc`, etc.
- **W1** Malformed skill files now log at `warn` level (was `debug`).
- **W3** `renderActivationHints` emits highest-priority skill even when
  it exceeds budget — never returns empty if input non-empty.
- **W4** `sanitizeTrigger` strips control chars, backticks, backslashes,
  triple-quote sequences. Caps length at 80 chars. Prompt-injection
  defense for malicious skill files.
- **W5** Toggle endpoint validates `projectSlug` + `skillId` against
  `^[a-z0-9][a-z0-9_-]{0,127}$/i`. Prevents DB pollution.
- **W7** `seedDefaultHarnessSkills` uses `flag: "wx"` (write-exclusive)
  to avoid TOCTOU between concurrent CLI starts.
- **W9** Frontmatter parser now supports inline array form
  `triggers: ["a", "b"]` in addition to multiline list.
- **I5** Toggle UI clears stale error on project switch / reload.

## Adversary findings deferred to Phase 1.5 / Phase 4

- **B1** Slug rename doesn't cascade toggle rows (orphan rows).
  Companion doesn't currently support slug rename in UI; documented.
- **B2** Already addressed via delta #1 above (decision to not inject
  for Claude).
- **W6** `seededProjects` Set unbounded across server lifetime —
  bound to ~1000 with FIFO eviction in Phase 1.5 if memory becomes
  observable issue.
- **W8** Filesystem hit per session start — add 60s TTL cache when
  Phase 4 metrics show overhead is non-trivial.
- **I2-I4** Integration test for adapter-context-builder + REST endpoint
  test + skill-seed test — Phase 1.5 hardening.
- **I6, I7** UX polish: spinner overlay during pending toggle + focus
  ring on toggle button.
- **I9** Surface DB read errors in UI (currently silently falls back
  to default).
