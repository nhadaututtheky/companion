# Phase 7: Bottom Stats Bar

## Goal
Add a floating stats bar at the bottom of the viewport (VinFast specs bar style) showing active sessions, cost, turns, and other activity metrics. Replaces the current HeaderStats in the header.

## Tasks
- [ ] Create `BottomStatsBar` component — fixed bottom, glass background, pill-shaped
- [ ] Move stats from header (active sessions, cost, turns) to bottom bar
- [ ] Add horizontal separator between stat items (like VinFast: 5 chỗ | 2 Motor | 349hp)
- [ ] Each stat: value in bold mono + label below in small text
- [ ] Glass effect: semi-transparent bg + blur + soft shadow upward
- [ ] Rounded-xl or pill shape for the bar container
- [ ] Centered horizontally, not full-width (floating island style)
- [ ] Hide on mobile or collapse to minimal (avoid blocking content)
- [ ] Animate in on load (slide up + fade)

## Acceptance Criteria
- [ ] Stats bar floats at bottom center
- [ ] Glass effect visible (content behind slightly blurred)
- [ ] Stats update in real-time (sessions, cost, turns)
- [ ] Doesn't overlap with session content or composer
- [ ] Mobile: hidden or collapsed

## Files Touched
- `packages/web/src/components/layout/bottom-stats-bar.tsx` — NEW
- `packages/web/src/components/layout/header.tsx` — remove HeaderStats from header
- `packages/web/src/app/page.tsx` — add BottomStatsBar to layout

## Dependencies
- Phase 1 (glass tokens), Phase 3 (layout shell)
