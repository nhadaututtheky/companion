# Phase 3: UI/UX Standards

## Goal
Fix inline styles (1,042 → 0), accessibility gaps, component oversizing. Align with CLAUDE.md design system rules.

## Tasks

### Component Splits (22 oversized files → target <300 LOC each)
- [ ] **U01** — Split `settings/page.tsx` (1,932 LOC)
  - Extract each tab: `settings/tabs/general.tsx`, `ai-provider.tsx`, `domain.tsx`, `telegram.tsx`, `mcp.tsx`, `rtk.tsx`, `appearance.tsx`
  - Keep `page.tsx` as tab router only (~100 LOC)
- [ ] **U02** — Split `ai-context-panel.tsx` (1,570 LOC)
  - Extract: `context-feed.tsx`, `context-config.tsx`, `graph-controls.tsx`
- [ ] **U03** — Split `new-session-modal.tsx` (1,205 LOC)
  - Extract: `session-form.tsx`, `provider-selector.tsx`, `template-variables-form.tsx`
- [ ] **U04** — Split `api-client.ts` (1,127 LOC)
  - Split by domain: `api/sessions.ts`, `api/projects.ts`, `api/templates.ts`, `api/settings.ts`, etc.
  - Keep `api-client.ts` as barrel export + base request function

### Inline Styles → Tailwind (1,042 occurrences)
- [ ] **U05** — Define theme-aware Tailwind utilities in `globals.css`
  - Map CSS variables to Tailwind classes:
    - `text-primary` → `color: var(--color-text-primary)`
    - `text-muted` → `color: var(--color-text-muted)`
    - `bg-card` → `background: var(--color-bg-card)`
    - `bg-elevated` → `background: var(--color-bg-elevated)`
    - `border-default` → `border-color: var(--color-border)`
    - `text-accent` → `color: var(--color-accent)`
  - Add `@theme` inline or `@utility` directives for TailwindCSS 4
- [ ] **U06** — Migrate inline styles in top-20 files (by occurrence count)
  - Priority: settings/page.tsx, session-details.tsx, session-list.tsx, message-feed.tsx, new-session-modal.tsx, ai-context-panel.tsx, mcp-settings.tsx
  - Replace `style={{ color: "var(--color-text-primary)" }}` → `className="text-primary"`
- [ ] **U07** — Migrate inline styles in remaining 30 files
  - Batch process: grep for `style={` and replace systematically

### Accessibility
- [ ] **U08** — Fix `outline-none` without focus alternative (75 instances)
  - Replace `outline-none` with `outline-none focus-visible:ring-2 focus-visible:ring-accent`
  - Priority files: settings page (15), mcp-settings (9), new-session-modal (5)
- [ ] **U09** — Add semantic HTML to page layouts
  - Wrap main content areas in `<main>`
  - Use `<nav>` for navigation bars
  - Use `<section>` for logical content groups
- [ ] **U10** — Add missing `aria-label` on icon-only buttons
  - Audit all `<button>` with only an icon child, add descriptive `aria-label`

### Performance
- [ ] **U11** — Add lazy loading for heavy components
  - `AiContextPanel` → `next/dynamic`
  - `CommandPalette` → `next/dynamic`
  - `OnboardingWizard` → `next/dynamic`
  - `GraphVisualization` → `next/dynamic` (pulls in @xyflow/react)

### Minor Fixes
- [ ] **U12** — Fix `as any` in `session-page-client.tsx:436`
  - Align types between page state and SessionDetails props
- [ ] **U13** — Replace `#6366f1` (default indigo) in `errors/page.tsx:33`
  - Use brand accent color instead

## Acceptance Criteria
- [ ] Zero `style={` occurrences in codebase (grep verification)
- [ ] Zero `outline-none` without `focus-visible:ring` alternative
- [ ] No file > 500 LOC in components/ (300 LOC target, 500 max)
- [ ] api-client.ts < 200 LOC
- [ ] Web build succeeds with zero TypeScript errors
- [ ] Lighthouse accessibility score ≥ 90

## Files Touched
- `packages/web/src/app/settings/page.tsx` — major split
- `packages/web/src/app/settings/tabs/` — new directory (7 files)
- `packages/web/src/components/panels/ai-context-panel.tsx` — split
- `packages/web/src/components/session/new-session-modal.tsx` — split
- `packages/web/src/lib/api-client.ts` — split
- `packages/web/src/app/globals.css` — add Tailwind utilities
- 50+ component files — inline style migration
- 21+ files — outline-none fix

## Dependencies
- Phase 1 + 2 completed
- U05 (Tailwind utilities) must be done before U06/U07 (migration)
