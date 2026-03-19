# Phase 8: Magic Ring — Shared Context Hub

## Goal
A floating, draggable "Magic Ring" that links 2-4 sessions for shared context discussions. Visual metaphor: a glowing hub connecting session spokes.

## Tasks

### 8.1 Create Magic Ring Component
- [x] Create `packages/web/src/components/ring/magic-ring.tsx`
- [x] Floating circle (48px), draggable via pointer events
- [x] Default position: bottom-right area
- [x] States:
  - **Idle**: pulsing blue glow (#4285F4), no sessions linked
  - **Linking**: user is selecting sessions (modal/dropdown)
  - **Active**: segments light up per linked session (progress ring)
    - 1/4 = 25% ring colored, 2/4 = 50%, etc.
    - Segment colors match session Google border colors
  - **Expanded**: opens shared context chat window
- [x] Click idle ring → open session selector
- [x] Click active ring → expand to shared context window
- [x] Drag anywhere on screen, persist position

### 8.2 Session Selector Modal
- [x] When clicking idle ring, show compact picker
- [x] List active sessions with checkboxes (max 4)
- [x] Each session shows: color dot, name, model badge
- [x] "Link" button to confirm
- [x] Topic input: what are they discussing?

### 8.3 Ring Visual — Progress Ring SVG
- [x] SVG circle with stroke-dasharray segments
- [x] Each linked session = 1 segment (90° for max 4)
- [x] Segment colors from session Google colors
- [x] Glow effect: box-shadow animation (pulse)
- [x] Badge: count of unread shared messages

### 8.4 Expanded Ring Window
- [x] Click active ring → expands to shared context panel
- [x] Glassmorphism card (like expanded session but different shape)
- [x] Header: topic, linked session avatars, close/collapse button
- [x] Chat area: user types shared context/question → broadcasts to all linked sessions
- [x] Aggregated view: all responses in timeline with session name/color labels

### 8.5 Broadcast Messages
- [x] When user sends message in Ring → call API for each linked session
- [x] Show "Broadcasting to N sessions..." indicator
- [x] Each response labeled with session color + name

### 8.6 Ring Store
- [x] Create `packages/web/src/lib/stores/ring-store.ts`
- [x] State: linkedSessionIds (max 4), topic, isExpanded, position {x, y}, messages[]

## Design
- Ring idle: #4285F4 glow, pulse animation
- Ring segments: Google colors matching session borders
- Expanded: glassmorphism, dashed connection lines
- Max 4 sessions per ring
- Ring always on top (z-index 40, below modals at 50)

## Files
- `packages/web/src/components/ring/magic-ring.tsx` — new
- `packages/web/src/components/ring/ring-selector.tsx` — new
- `packages/web/src/components/ring/ring-window.tsx` — new
- `packages/web/src/lib/stores/ring-store.ts` — new
- `packages/web/src/app/page.tsx` — mount MagicRing

## Dependencies
- Phase 2 (grid), Phase 5 (channel API)
