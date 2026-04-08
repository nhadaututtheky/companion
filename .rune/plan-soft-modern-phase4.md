# Phase 4: Cards & Grid

## Goal
Session cards and mini-terminals become floating, pillow-soft cards with generous padding and shadow-based separation.

## Tasks
- [ ] Mini-terminal cards: apply glass-card style + increased border-radius (20-24px)
- [ ] Mini-terminal cards: remove hard borders → soft shadow only
- [ ] Mini-terminal cards: increase internal padding (12px → 16px)
- [ ] Session header: pill-shaped status badges, softer model badges
- [ ] Session grid: increase gap (12px → 16px)
- [ ] Permission gate bar: rounded-xl, softer yellow background
- [ ] Compact composer: pill-shaped input, rounded send button
- [ ] Expanded session card: glass backdrop, rounded-2xl (keep mobile fullscreen)
- [ ] Resume banner: floating card style with soft shadow

## Acceptance Criteria
- [ ] Cards visually float above the background
- [ ] No hard 1px borders visible on cards
- [ ] Grid has breathing room between cards
- [ ] Status badges are pill-shaped
- [ ] Mobile: cards stack cleanly without horizontal overflow

## Files Touched
- `packages/web/src/components/grid/mini-terminal.tsx` — modify
- `packages/web/src/components/grid/session-header.tsx` — modify
- `packages/web/src/components/grid/session-grid.tsx` — modify
- `packages/web/src/components/ui/status-badge.tsx` — modify

## Dependencies
- Phase 1 (tokens), Phase 3 (layout shell for visual consistency)
