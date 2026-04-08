# Phase 6: Polish & Dark Mode

## Goal
Fine-tune dark mode glass effects, add micro-interactions, ensure visual consistency across all states.

## Tasks
- [ ] Dark mode: glass cards use frosted dark (rgba(30,30,30,0.6) + blur)
- [ ] Dark mode: verify all shadows visible against dark bg (increase opacity if needed)
- [ ] Dark mode: glass header with dark tint
- [ ] Hover micro-interactions: cards lift slightly (translateY(-2px) + shadow increase)
- [ ] Transition: all border-radius changes use 150ms ease for smooth theme switch
- [ ] Scrollbar: match soft style (rounded thumb, transparent track)
- [ ] Loading skeletons: rounded to match new card radius
- [ ] Right panels (Files, Browser, Stats, etc.): rounded-xl, soft borders
- [ ] Activity terminal: rounded top corners when collapsed
- [ ] Visual audit: screenshot all major views, check consistency
- [ ] prefers-reduced-motion: verify no new animations break this

## Acceptance Criteria
- [ ] Dark mode looks cohesive — glass effect visible
- [ ] Light mode is clean, airy, "transparent"
- [ ] Hover states feel smooth and intentional
- [ ] No visual regression on mobile
- [ ] All accessibility requirements maintained (contrast, focus-visible, touch targets)

## Files Touched
- `packages/web/src/app/globals.css` — modify (dark mode tweaks)
- Various component files — minor adjustments
- `packages/web/src/components/panels/*` — modify (right panels)
- `packages/web/src/components/layout/activity-terminal.tsx` — modify

## Dependencies
- All previous phases completed
