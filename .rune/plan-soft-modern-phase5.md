# Phase 5: Forms & Controls

## Goal
All interactive controls (buttons, inputs, tabs, dropdowns) adopt pill/rounded style with soft focus states.

## Tasks
- [ ] Button component: increase border-radius → pill (9999px) for sm/md, xl for lg
- [ ] Button primary: soft shadow on hover instead of darken
- [ ] Input fields: border-radius → 12px, softer border (lighter color)
- [ ] Tabs (settings, new session steps): pill-shaped active indicator
- [ ] Tab active state: filled pill background instead of colored text
- [ ] Select/dropdown: rounded-xl with soft shadow
- [ ] Search bar in command palette: pill-shaped

## Acceptance Criteria
- [ ] All buttons have rounded-full or rounded-xl appearance
- [ ] Input focus shows soft glow, not hard outline
- [ ] Tab navigation uses pill indicators
- [ ] No sharp 90° corners on any interactive element
- [ ] Accessibility: focus-visible still distinguishable

## Files Touched
- `packages/web/src/components/ui/button.tsx` — modify
- `packages/web/src/components/settings/settings-tabs.tsx` — modify (tab styles)
- `packages/web/src/components/settings/settings-modal.tsx` — modify (tab nav)
- `packages/web/src/components/session/new-session-modal.tsx` — modify (step tabs)
- `packages/web/src/components/layout/command-palette.tsx` — modify (search input)

## Dependencies
- Phase 1 (tokens)
