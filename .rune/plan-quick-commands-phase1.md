# Phase 1: Catalog + Web Picker

## Goal

Ship shared command catalog + `/cmd` slash picker in web composer so a
user typing `/cmd` sees a grouped palette, clicks a command, and it gets
inserted into the input. End-to-end on web only — Telegram is phase 2.

## Tasks

- [ ] Create `packages/shared/src/quick-commands/catalog.json` — 10 groups × ~30 commands each (~300 total). Fields per command: `{ id, cmd, description, tags? }`. Curate from token-ninja rules repo (MIT).
- [ ] Create `packages/shared/src/quick-commands/index.ts` — `QuickCommand`, `QuickCommandGroup` types; `loadCatalog()`, `getGroup(id)`, `searchCommands(query)` helpers
- [ ] Export from `packages/shared/src/index.ts`
- [ ] Create `NOTICE.md` at repo root — attribute token-ninja MIT (rule curation source)
- [ ] Create `packages/web/src/components/chat/quick-command-picker.tsx` — popover triggered by `/cmd` in composer, 2-panel: group list (left) + commands of selected group (right), search box on top, click command → `onSelect(cmd)` callback
- [ ] Wire into existing composer slash-command dispatcher in `message-composer.tsx` — when user types `/cmd`, open picker instead of sending. On select, `insertText(cmd)` into textarea at cursor, close picker.
- [ ] Add keyboard nav: `↑/↓` group, `Tab` into commands, `Enter` select, `Esc` close
- [ ] Unit tests: catalog loader returns groups/commands, search filters correctly across group+description
- [ ] Component test: picker renders groups, clicking command fires onSelect with correct string

## Acceptance Criteria

- [ ] Typing `/cmd` in composer opens picker (does NOT send message)
- [ ] Picker shows 10 groups with command counts
- [ ] Clicking group shows its commands with descriptions
- [ ] Search box filters across all groups + descriptions (e.g. "branch" shows `git branch`, `git branch -a`, `git checkout -b`)
- [ ] Clicking a command inserts exact command string into composer textarea, picker closes, input focused
- [ ] Keyboard: `↑/↓` navigates, `Enter` selects, `Esc` cancels
- [ ] No regression: existing `/skill` commands still work, send still works for non-`/cmd` input
- [ ] 5+ unit tests for catalog + search; 3+ component tests for picker

## Files Touched

### New
- `packages/shared/src/quick-commands/catalog.json`
- `packages/shared/src/quick-commands/index.ts`
- `packages/shared/src/quick-commands/__tests__/catalog.test.ts`
- `packages/web/src/components/chat/quick-command-picker.tsx`
- `packages/web/src/components/chat/__tests__/quick-command-picker.test.tsx`
- `NOTICE.md`

### Modified
- `packages/shared/src/index.ts` — re-export quick-commands
- `packages/web/src/components/chat/message-composer.tsx` — intercept `/cmd`, mount picker

## Dependencies

- None (foundational)
- Reuses existing shadcn popover / command components already in web
- Uses existing shared package build pipeline

## Design notes

**Group list (v1):**
```
git       — 30 commands
github    — 20 commands  (gh cli)
npm-like  — 25 commands  (npm/pnpm/yarn/bun shared)
docker    — 25 commands
k8s       — 20 commands  (kubectl)
python    — 20 commands  (pip/poetry/uv/pytest)
build     — 20 commands  (make/just/cargo/go)
test-lint — 25 commands  (vitest/jest/eslint/prettier/ruff)
net-fs    — 20 commands  (curl/wget/ls/find/ripgrep/fd)
db        — 15 commands  (psql/sqlite/redis-cli)
```

**Catalog shape:**
```json
{
  "groups": [
    {
      "id": "git",
      "name": "Git",
      "icon": "GitBranch",
      "commands": [
        { "id": "git-status", "cmd": "git status", "description": "Show working tree status" },
        { "id": "git-log-oneline", "cmd": "git log --oneline -10", "description": "Last 10 commits" }
      ]
    }
  ]
}
```

**Picker UX inspiration** — shadcn `<Command>` (cmdk) component already
used elsewhere in the web app. Use same pattern: `CommandInput` +
`CommandList` + `CommandGroup` + `CommandItem`. Zero new dependencies.

**Insert behavior** — insert at current cursor position, not replace. So
user can type `explain this: /cmd git log` → picker opens → pick command
→ result: `explain this: git log --oneline -10`. Cursor ends after
inserted text.

**Slash dispatch** — `message-composer.tsx` already routes `/<name>` for
skills. Add `/cmd` as reserved name → route to picker instead of treating
as skill. Existing skill lookup should not find `/cmd` (reserve the name
in skills registry or check quick-commands first).

## Out of scope (defer)

- Telegram picker (Phase 2)
- Recent commands tracking (Phase 3)
- Context-aware group ordering based on project type (Phase 3)
- Favorites / pinning (Phase 3)
- User-defined custom commands (Phase 3+)
- Command parameter templating (e.g. `git commit -m "<msg>"` prompting user) — v1 inserts raw, user edits flags manually
