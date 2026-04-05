# Phase 1: Foundation — Types, Built-in Personas, Avatar, UI Rename

## Goal
Create persona schema, ship 12 built-in expert personas with SVG avatars, update Templates page to show personas with avatar + tooltip, rename "Templates" → "Expert Modes".

## Tasks
- [x] Create Persona types in shared package
- [x] Create 12 built-in personas with rich system prompts (5-layer depth)
- [x] Create PersonaAvatar component (SVG stylized portraits)
- [x] Create PersonaTooltip component (hover → strengths, intro, best-for)
- [x] Update /templates page → "Expert Modes" (keep URL, rename display)
- [x] Update header TemplateQuickPicker → show personas + custom prompts
- [x] Rename "New template" → "Create Custom"

## Built-in Personas (v1)
### Tech Leaders (5)
1. Tim Cook — Simplification, operations
2. Elon Musk — First principles, delete steps
3. John Carmack — Performance, ship fast
4. DHH — Anti-complexity, monolith
5. Satya Nadella — Platform thinking

### Engineering Roles (5)
6. Staff SRE — Reliability, blast radius
7. Security Auditor — Attack surface, threat model
8. Performance Engineer — Profiling, latency
9. Frontend Architect — UX/DX, components
10. Database Architect — Data modeling, queries

### Wild Cards (2)
11. Devil's Advocate — Argue against everything
12. Junior Dev — "I don't understand" → readability

## Files Touched
- `packages/shared/src/personas.ts` — new: types + built-in definitions
- `packages/web/src/components/persona/persona-avatar.tsx` — new
- `packages/web/src/components/persona/persona-tooltip.tsx` — new
- `packages/web/src/app/templates/page.tsx` — modify: rename + persona cards
- `packages/web/src/components/layout/template-quick-picker.tsx` — modify
- `packages/web/src/components/layout/header.tsx` — modify: tooltip

## Acceptance Criteria
- [ ] 12 personas visible on templates page with avatars
- [ ] Hover avatar → tooltip with strengths, intro, best-for tags
- [ ] UI says "Expert Modes" not "Templates"
- [ ] Build passes
