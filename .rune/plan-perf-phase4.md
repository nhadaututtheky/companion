# Phase 4: Zustand Store + Auto-Scroll

## Goal
Reduce unnecessary re-renders from wide store selectors and fix auto-scroll behavior.

## Tasks
- [ ] Narrow `s.sessions` selectors in 5 components:
  - `header.tsx` — only select derived stats (count, running count), not full map
  - `bottom-stats-bar.tsx` — same pattern: derive in selector, not in component
  - `activity-terminal.tsx` — select only session names/statuses needed
  - `ring-selector.tsx` — select only what ring needs
  - `ring-window.tsx` — select only what ring needs
- [ ] Merge 3 separate `useSessionStore` calls in `mini-terminal.tsx` into 1 `useShallow`
  - Currently: `sessions[id]`, `sessions[id]?.childSessionIds`, `sessions[id]?.flashType`
  - Merge: `useShallow(s => ({ session: s.sessions[id], childIds: ..., flashType: ... }))`
- [ ] Fix mini-terminal auto-scroll:
  - Add "user has scrolled up" detection (compare scrollTop + clientHeight vs scrollHeight)
  - Only auto-scroll if user is near bottom (within 100px)
  - Use `requestAnimationFrame` to avoid layout thrash
  - Depend on `messages.length` instead of `messages` reference
- [ ] Fix `flushStreamBuffer` array allocation:
  - Use immer or manual index update instead of `[...prev.slice(0, -1), updated]`
  - Or: maintain streaming message separately, merge on finalize

## Acceptance Criteria
- [ ] `header.tsx` does NOT re-render on context_update events
- [ ] Scrolling up in mini-terminal stays stable (no force-jump)
- [ ] Mini-terminal auto-scrolls when user is at bottom
- [ ] React DevTools: verify reduced render count on header/bottom-bar during streaming

## Files Touched
- `packages/web/src/components/layout/header.tsx` — narrow selector
- `packages/web/src/components/layout/bottom-stats-bar.tsx` — narrow selector
- `packages/web/src/components/activity/activity-terminal.tsx` — narrow selector
- `packages/web/src/components/ring/ring-selector.tsx` — narrow selector  
- `packages/web/src/components/ring/ring-window.tsx` — narrow selector
- `packages/web/src/components/grid/mini-terminal.tsx` — merge selectors, fix scroll
- `packages/web/src/hooks/use-session.ts` — optimize flushStreamBuffer

## Dependencies
- Independent of Phase 1–3 (can run in parallel)
