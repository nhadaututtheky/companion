# Phase 5: Color Palette (DEFERRED)

## Status

⬚ **Deferred** — wait for design system pass.

## Why deferred

294 inline hex codes (`#4285f4`, `#34A853`, `#FBBC04`, `#EA4335`...) scattered across web components. Tempting to extract to `lib/colors.ts` JS const, but:

1. **CSS variables are the right home** — `var(--color-accent)`, `var(--color-success)` etc. already exist for design system theming. JS const = second source of truth = will drift from CSS.
2. **Doing this twice wastes effort** — extract to JS now, re-extract to CSS vars later when palette refactor lands. Better to skip JS step.
3. **Light/dark theming**: hex in JS doesn't auto-respond to color scheme. CSS vars do.

## When to revisit

When the design system pass starts (next palette/theme work), do:
- [ ] Audit all 294 hex codes
- [ ] Map each to a semantic CSS variable (`--color-success` not `--color-green`)
- [ ] Add missing variables to `globals.css` / `theme.css`
- [ ] Replace inline hex with `var(--...)` directly in JSX `style={{ color: 'var(--color-success)' }}` or via Tailwind class if pattern repeats
- [ ] Remove hex from JS entirely

## Estimated LOC saved

- ~70 LOC of inline hex repetition (when done right via CSS vars)

## What NOT to do in this phase

- Do NOT create `lib/colors.ts` with `export const ACCENT = '#4285f4'`. That's the wrong layer.
- Do NOT mass-find-replace `#4285f4` → `var(--color-accent)` without auditing — many hex codes are intentionally one-off (eg. brand colors for specific providers, debate participant chips).

## Files NOT to touch yet

All web components. Wait.
