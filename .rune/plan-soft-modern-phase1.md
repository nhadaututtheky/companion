# Phase 1: Design Tokens

## Goal
Update foundational CSS variables and add glass/pill utility classes. Every subsequent phase builds on these tokens.

## Tasks
- [x] Increase border-radius tokens: sm→8px, md→12px, lg→16px, xl→24px, pill→9999px
- [x] Add softer, larger shadow tokens: shadow-soft, shadow-float, shadow-glow
- [x] Add glass utility variables: glass-bg, glass-border, glass-blur
- [x] Add dark mode glass variants (merged into .dark block)
- [x] Add `.glass-card` + `.glass-card-heavy` utility classes (light + dark)
- [x] Add `.glass-pill` utility class for pill-shaped glass elements
- [x] Add `.shadow-float` utility for floating card effect
- [x] Add `.focus-glow` utility for soft focus ring
- [x] Update existing `.input-bordered` to use new radius + glow focus
- [x] Update `.input-wrapper` to use new radius + glow focus
- [x] Update `.persona-card` hover to use new shadows + translateY

## Acceptance Criteria
- [ ] All new tokens available in both light and dark mode
- [ ] `.glass-card` produces visible frosted glass effect
- [ ] No existing UI broken — only foundation added
- [ ] `globals.css` still under ~600 lines

## Files Touched
- `packages/web/src/app/globals.css` — modify (tokens + utilities)

## Dependencies
- None — this is the foundation phase
