# Phase 8: Polish & Dark Mode

## Goal
Fine-tune dark mode glass effects, add micro-interactions, ensure visual consistency across all states.

## Tasks
- [ ] Dark mode: glass cards use frosted dark (rgba(30,30,30,0.6) + blur)
- [ ] Dark mode: verify all shadows visible against dark bg
- [ ] Dark mode: glass header + floating menu with dark tint
- [ ] Dark mode: bottom stats bar dark glass
- [ ] Hover micro-interactions: cards lift (translateY(-2px) + shadow increase)
- [ ] Floating menu: smooth enter/exit animation (scale + opacity)
- [ ] Scrollbar: match soft style
- [ ] Loading skeletons: rounded to match new card radius
- [ ] Right panels (when opened from mega-menu): rounded-xl, soft borders
- [ ] Activity terminal: rounded top corners
- [ ] Visual audit: all views consistent
- [ ] prefers-reduced-motion: verify no new animations break

## Acceptance Criteria
- [ ] Dark mode cohesive — glass effects visible
- [ ] Light mode clean, airy, transparent
- [ ] Hover states smooth and intentional
- [ ] No visual regression on mobile
- [ ] Accessibility maintained (contrast, focus-visible, touch targets)

## Files Touched
- `packages/web/src/app/globals.css` — dark mode tweaks
- Various component files — minor adjustments
- `packages/web/src/components/panels/*` — right panels
- `packages/web/src/components/layout/activity-terminal.tsx` — modify

## Dependencies
- All previous phases completed
