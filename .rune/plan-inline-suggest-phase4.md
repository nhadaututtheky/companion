# Phase 4: Polished UI + Telemetry

## Goal

Upgrade the minimal Phase 1 strip into a polished, keyboard-navigable,
themed UI with per-suggestion icons + dismiss control + telemetry so
future phases can learn which providers deliver value.

## Tasks

- [ ] Icon mapping per source — phosphor icons:
  - `skill` → `Lightning`
  - `agent` → `Robot`
  - `mcp` → `Plugs`
  - `model` → `Brain`
  - `memory` → `Notebook`
- [ ] Keyboard navigation:
  - `Tab` or `Cmd+ArrowUp/Down` cycles through suggestions
  - `Enter` accepts focused suggestion
  - `Esc` dismisses strip for this prompt
  - `Cmd+Shift+S` manually trigger suggest (bypass debounce)
- [ ] Theme tokens — strip uses `--color-bg-card` / `--color-border` / `--color-text-secondary`, respects light + dark + custom VSCode themes
- [ ] Loading state — shimmer on pill while providers resolve (for providers with async work)
- [ ] Empty state — strip hidden entirely when no suggestions
- [ ] Dismiss memory — "don't show this suggestion again" per suggestion ID (session-scoped in v1, project-scoped in v2)
- [ ] Telemetry:
  - Log event when suggestion shown, accepted, dismissed
  - Track: source, suggestion id, prompt length, accepted (bool)
  - Store in server SQLite `suggest_events` table
  - Expose `GET /api/registry/suggest-stats` for debugging
- [ ] Settings → General:
  - Per-provider toggles (Skills, Agents, MCP)
  - "Reset dismissed suggestions" button
- [ ] Accessibility:
  - `role="listbox"` on strip, `role="option"` on pills
  - `aria-label` per pill ("Accept suggestion: <title>")
  - Focus ring visible on focus (design-dna compliant)
- [ ] Analytics dashboard (optional, defer to v2 if too big):
  - Simple admin page showing accept/dismiss rate per provider

## Acceptance Criteria

- [ ] Tab cycles through pills, Enter accepts
- [ ] Icons render correctly for all 3 Phase 1-3 providers
- [ ] Theme changes (dark/light/custom) re-theme strip without reload
- [ ] Dismissed suggestion stays hidden until "Reset" pressed
- [ ] Telemetry events log to SQLite on accept/dismiss
- [ ] Screen reader announces suggestion focus correctly
- [ ] No layout shift when strip appears/disappears (reserve vertical space)
- [ ] Tests: 8+ covering keyboard nav, telemetry write, theme application

## Files Touched

### New
- `packages/server/src/db/schema/suggest-events.ts` — Drizzle schema
- `packages/server/src/db/migrations/XXXX_add_suggest_events.sql`
- `packages/server/src/services/suggest-telemetry.ts`
- `packages/web/src/hooks/use-suggestion-keyboard.ts`
- `packages/web/src/lib/suggest/icons.ts` — source → icon map

### Modified
- `packages/web/src/components/chat/suggestion-strip.tsx` — full rebuild
- `packages/server/src/routes/registry.ts` — add telemetry endpoints
- `packages/web/src/app/settings/general/page.tsx` — per-provider toggles + reset
- `packages/web/src/lib/suggest/engine.ts` — emit telemetry events

## Dependencies

- Phases 1-3 (need real providers to test UI against)
- `FEATURE_REGISTRY.md` may need update (new suggest_events table)

## Design notes

**Layout budget** — strip occupies max 40px vertical. Single row, horizontal scroll if needed (rare, since max 3 suggestions).

**Pill anatomy**:
```
[icon] title · provider-name          [×]
       description (truncate)
```

**Focus ring** — 2px ring in `--color-accent`, offset 2px. Per design-dna UX checklist.

**Telemetry privacy** — never log prompt content, only metadata (length, matched provider). User can disable telemetry entirely in Settings → Privacy.

**Custom action types** — by Phase 4, may need new action handlers:
- `set-model` (from future v2) — dispatches model switch via Companion IPC
- `recall-memory` — opens NM recall panel

Keep dispatcher in engine so providers don't need to know UI internals.

## Out of scope

- Inline LLM-based intent classification (still regex-based; upgrade in v2)
- Cross-device sync of dismissed suggestions (localStorage in v1)
- A/B testing scoring tweaks
