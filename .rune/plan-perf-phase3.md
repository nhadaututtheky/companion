# Phase 3: Virtualization

## Goal
Reduce DOM node count for long sessions. CompactMessageFeed renders ALL messages with no limit. MessageFeed only virtualizes above 50.

## Tasks
- [ ] Add virtualization to `CompactMessageFeed` using `@tanstack/react-virtual`
  - Threshold: 20 messages (mini-terminal has limited space, many messages = waste)
  - Below 20: plain `.map()` (current behavior)
  - `estimateSize: 48` (compact bubbles are shorter)
  - `overscan: 5` (less than expanded view)
- [ ] Lower `MessageFeed` `VIRTUALIZE_THRESHOLD` from 50 → 20
- [ ] Lazy-instantiate virtualizer — only create when `shouldVirtualize` is true
  - Currently `useVirtualizer` runs unconditionally (line 508)
  - Wrap in conditional or use `enabled` option if available
- [ ] Fix smooth-scroll judder during streaming
  - Use `behavior: "auto"` instead of `"smooth"` when streaming is active
  - Only use smooth scroll for user-initiated navigation (pin jump)

## Acceptance Criteria
- [ ] Mini-terminal with 100 messages: DOM shows ~15 visible nodes, not 100
- [ ] Expanded session with 100 messages: DOM shows ~20 visible nodes
- [ ] No scroll jump or flash when virtualization kicks in at message 20
- [ ] Smooth scroll still works for pin message navigation

## Files Touched
- `packages/web/src/components/grid/compact-message.tsx` — add virtualization
- `packages/web/src/components/session/message-feed.tsx` — lower threshold, lazy virtualizer, fix scroll

## Dependencies
- Phase 2 (memo) should be done first — virtualization + memo = maximum benefit
