# Phase 1: Foundation + Skills Provider

## Goal

Build the pluggable suggestion engine + first provider (Skills) so
future providers slot in without refactoring. Ship a minimal inline
strip above the prompt input to validate the loop end-to-end.

## Tasks

- [ ] Create `packages/web/src/lib/suggest/types.ts` — `Suggestion`, `SuggestionAction`, `SuggestionContext`, `SuggestionProvider` interfaces
- [ ] Create `packages/web/src/lib/suggest/engine.ts` — `SuggestionEngine` class: register providers, call `suggest(ctx)` in parallel, dedupe by `id+source`, rank by score (desc), return top 3
- [ ] Create `packages/web/src/lib/suggest/intent.ts` — `matchKeywords(prompt, patterns)` helper returning boolean + matched keyword (for score boost)
- [ ] Create `packages/web/src/lib/suggest/registry-store.ts` — Zustand slice caching registry data, `fetchSkills()` / `refresh()` actions
- [ ] Create `packages/server/src/routes/registry.ts` — `GET /api/registry/skills` returns parsed `~/.claude/skills/*.md` + project `.claude/skills/*.md` (name + description from frontmatter)
- [ ] Create `packages/web/src/lib/suggest/providers/skills.provider.ts` — reads registry-store, matches prompt via keyword patterns per skill, returns `Suggestion[]` with `action: { type: 'insert-text', payload: '/skill-name ' }`
- [ ] Create `packages/web/src/components/chat/suggestion-strip.tsx` — minimal UI: 3 pills above input, click → dispatch action, ESC dismisses
- [ ] Wire into prompt input component — subscribe to input value (debounce 200ms), call `engine.suggest()`, render strip when non-empty
- [ ] Add toggle in Settings → General → "Show inline suggestions" (default ON)
- [ ] Unit tests: engine dedupe + ranking, Skills provider keyword match, intent.ts matchKeywords

## Acceptance Criteria

- [ ] Typing "ship feature" surfaces `/ship` skill suggestion
- [ ] Typing "test this" surfaces `/test` skill suggestion (if exists)
- [ ] Click suggestion inserts text into input at cursor position
- [ ] ESC dismisses strip for current prompt (not session)
- [ ] Debounced — no suggestion compute while user types fast
- [ ] Settings toggle fully disables the feature
- [ ] Zero regression on existing prompt input (tests pass, typecheck clean)
- [ ] 5+ unit tests covering engine + Skills provider

## Files Touched

### New
- `packages/web/src/lib/suggest/types.ts`
- `packages/web/src/lib/suggest/engine.ts`
- `packages/web/src/lib/suggest/intent.ts`
- `packages/web/src/lib/suggest/registry-store.ts`
- `packages/web/src/lib/suggest/providers/skills.provider.ts`
- `packages/web/src/lib/suggest/index.ts` — barrel export
- `packages/web/src/components/chat/suggestion-strip.tsx`
- `packages/server/src/routes/registry.ts`
- `packages/web/src/lib/suggest/__tests__/engine.test.ts`
- `packages/web/src/lib/suggest/__tests__/skills.test.ts`

### Modified
- `packages/web/src/components/chat/prompt-input.tsx` (or equivalent) — mount strip, wire engine
- `packages/server/src/app.ts` — register `/api/registry` route
- `packages/web/src/app/settings/general/page.tsx` — add toggle

## Dependencies

- None (foundational phase)
- Uses existing Zustand setup, existing Hono router, existing settings page pattern

## Design notes

**Keyword pattern file** — each skill can optionally declare patterns in frontmatter:
```yaml
---
name: ship
description: Full ship pipeline
suggest_triggers: ['ship', 'deploy', 'release']
---
```
If `suggest_triggers` missing, fallback to skill `name` as single trigger.

**Scoring** — Skills provider returns `score = 0.8` for exact keyword match, `0.5` for fuzzy. Future providers calibrate independently.

**Cache invalidation** — `registry-store` exposes `refresh()`, auto-called on Settings → "Refresh registry" button (manual). Skills rarely change mid-session.

## Out of scope (defer to later phases)

- Agent suggestions (Phase 2)
- MCP suggestions (Phase 3)
- Telemetry collection (Phase 4)
- Icons per suggestion (Phase 4, use generic ⚡ in Phase 1)
- Keyboard navigation between pills (Phase 4)
