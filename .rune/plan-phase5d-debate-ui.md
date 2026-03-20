# Phase 5D: Magic Ring Redesign + Debate UI

## Goal
Redesign Magic Ring from rectangular popup to a hand fan (扇子) UI. Ring orb = pivot point, fan blades radiate upward as semicircle. Integrate debate mode directly into the fan. Each session = 1 blade.

## Design Vision

### Current Problems
- RingWindow/RingSelector are plain rectangles that partially cover the Ring orb
- Opening animation is basic (no personality)
- Window feels disconnected from the Ring — floats beside it instead of radiating from it

### New Design: Hand Fan (扇子)

```
        ╱  ╱  |  ╲  ╲
       ╱  ╱   |   ╲  ╲
      ╱  ╱    |    ╲  ╲
     ╱ S1 ╱ S2 | S3 ╲ S4 ╲
    ╱────╱─────|─────╲────╲
              ⬤ Ring (pivot)
```

**Metaphor**: Real hand fan — Ring orb is the pivot/rivet (chốt quạt),
fan blades (nan quạt) radiate upward as a semicircle (~180°).

1. **Ring orb = pivot**: All blades originate from the orb center
   - Orb stays visible at the bottom, never covered
   - Fan radiates in the opposite direction from orb's screen position:
     - Orb bottom-right → fan opens up-left (default)
     - Orb bottom-left → fan opens up-right
     - Orb top-* → fan opens downward
   - `transform-origin` always at orb center point

2. **Fan blades = sessions**: Each linked session is a blade (nan quạt)
   - 1 session = 1 blade spanning ~160° of the semicircle
   - 2 sessions = 2 blades (~80° each)
   - 3 sessions = 3 blades (~53° each)
   - 4 sessions = 4 blades (~40° each)
   - Thin divider lines between blades (like bamboo ribs)
   - Session color on blade edge, label + model near the arc
   - Blade hover: subtle brightness increase

3. **Fan surface = content area**: The fabric between the ribs
   - Broadcast mode: shared messages + input overlaying the fan surface
   - Debate mode: agent-labeled messages, round separators
   - Content in a readable card/panel overlaying the fan center
   - Verdict: centered overlay card on the fan surface

4. **Fan open/close animation**:
   - Closed: all blades stacked (0° spread), hidden behind orb
   - Opening: blades spread from 0° → full arc with staggered timing
     - Each blade rotates out with 50ms delay (1st → 2nd → 3rd → 4th)
     - Spring easing: 500ms cubic-bezier(0.34, 1.56, 0.64, 1)
   - Closing: reverse — blades fold back to 0° and fade
   - CSS: each blade uses `transform: rotate(Ndeg)` from pivot point

5. **Ring Selector** (link sessions): Mini fan variant
   - Available sessions arranged as smaller blades on the arc
   - Each blade = 1 session option with toggle
   - Topic input overlays the fan center
   - Link/Cancel buttons at the bottom near pivot

## Tasks

### 5D.1 — Fan Shape & Animation Engine
- [ ] Create `fan-layout.ts` utility:
  - [ ] Calculate blade angles based on N sessions + orb position
  - [ ] Quadrant detection: determine fan direction from orb screen position
  - [ ] Blade dimensions: inner radius (orb size), outer radius (~280px), arc per blade
- [ ] Fan container component using SVG or CSS transforms:
  - [ ] Each blade = absolutely positioned element with `transform-origin` at orb center
  - [ ] `transform: rotate(startAngle)` positions each blade
  - [ ] `clip-path: polygon()` or SVG `<path>` for blade shape (trapezoid/sector)
- [ ] Fan open animation:
  - [ ] Blades start stacked at 0° behind orb
  - [ ] Staggered spread: blade 1 at 50ms, blade 2 at 100ms, etc.
  - [ ] Spring easing: cubic-bezier(0.34, 1.56, 0.64, 1), 500ms duration
  - [ ] Fan surface (content area) fades in after blades are 50% spread
- [ ] Fan close animation: reverse with faster timing (300ms)
- [ ] Position logic: fan always opens AWAY from nearest screen edge

### 5D.2 — Blade Components (Session Sectors)
- [ ] `ring-blade.tsx` — individual blade component
  - [ ] Session color gradient along the blade
  - [ ] Label text following the blade curve (or straight near arc edge)
  - [ ] Model + status indicator near outer arc
  - [ ] Hover: glow effect, slight scale
  - [ ] Click: focus this session (other blades dim)
- [ ] Blade dividers: thin lines like bamboo ribs between blades
- [ ] Blade content (mini view):
  - [ ] Last message snippet or session status
  - [ ] Cost indicator (small)

### 5D.3 — Fan Surface Content
- [ ] **Broadcast mode** (default):
  - [ ] Shared messages in a scrollable panel overlaying fan center
  - [ ] Input bar at the bottom of the fan surface (near pivot)
  - [ ] Messages styled with session color indicators
- [ ] **Debate mode**:
  - [ ] Auto-detect: if linked sessions share a debate channel → switch mode
  - [ ] Orb visual change: ⚖️ icon, debate-specific glow (alternating blue/red pulse)
  - [ ] Fan surface shows debate timeline:
    - [ ] Round separators ("Round N" headers)
    - [ ] Agent-labeled messages: 🔵 Advocate (#4285F4), 🔴 Challenger (#EA4335), ⚖️ Judge (#FBBC04), 👤 Human (#34A853)
    - [ ] Each blade header shows agent role for that session
  - [ ] User input → injected as "human" role into channel
- [ ] **Verdict rendering**:
  - [ ] Centered card overlay on fan surface
  - [ ] Sections: Winner, Agreement Points, Arguments, Unresolved, Confidence meter
  - [ ] Expandable/collapsible sections

### 5D.4 — RingSelector as Mini Fan
- [ ] Replace rectangle popup with fan-style session picker
  - [ ] Available sessions = small blades on the arc
  - [ ] Each blade has checkbox toggle + session label + color
  - [ ] Topic input overlays center
  - [ ] Link/Cancel buttons near pivot
- [ ] Same staggered fan-open animation

### 5D.5 — Debate History
- [ ] "History" mode accessible via small icon on fan surface header
  - [ ] List past debates: topic, date, verdict summary, cost
  - [ ] Click → load full transcript in fan surface
  - [ ] Filter by project
- [ ] No separate /debates page needed — all in Ring

## Technical Implementation Notes

### Approach A: SVG-based (recommended)
- Blades as SVG `<path>` elements with arc segments
- `d="M cx cy L x1 y1 A rx ry rotation large-arc sweep x2 y2 Z"` for sector shape
- Animation via CSS transform on SVG groups
- Content overlay as HTML `<foreignObject>` inside SVG, or separate positioned div

### Approach B: CSS transforms
- Each blade is a `<div>` with `clip-path: polygon(...)` for trapezoid shape
- `transform-origin: bottom center` (pivot point)
- `transform: rotate(Ndeg)` for positioning
- Simpler but less precise for curved edges

### Responsive
- Fan radius scales with viewport: `min(280px, 35vw)`
- Mobile: fan opens upward, smaller radius, touch-friendly blade targets (min 44px arc width)
- `prefers-reduced-motion`: skip fan animation, instant show/hide

## Acceptance Criteria
- [ ] Fan opens from Ring orb as pivot — blades spread like real hand fan
- [ ] Staggered blade animation feels smooth and organic
- [ ] N sessions = N blades (up to 4), proper angular spacing
- [ ] Fan direction adapts to orb screen position (never goes off-screen)
- [ ] Ring orb is NEVER covered by the fan
- [ ] Debate mode auto-activates when linked sessions are in a debate channel
- [ ] Debate messages show in fan surface with agent labels + round separators
- [ ] Verdict renders as centered card on fan surface
- [ ] RingSelector is also fan-shaped
- [ ] Mobile responsive (smaller radius, touch-friendly)
- [ ] prefers-reduced-motion respected

## Files
- `packages/web/src/components/ring/magic-ring.tsx` — modify (orb debate state, fan trigger)
- `packages/web/src/components/ring/ring-window.tsx` — rewrite → fan container
- `packages/web/src/components/ring/ring-selector.tsx` — rewrite → mini fan picker
- `packages/web/src/components/ring/ring-blade.tsx` — new (individual blade component)
- `packages/web/src/components/ring/fan-surface.tsx` — new (content area overlay)
- `packages/web/src/components/ring/debate-timeline.tsx` — new (debate messages)
- `packages/web/src/components/ring/verdict-card.tsx` — new (verdict overlay)
- `packages/web/src/components/ring/fan-layout.ts` — new (angle/position calculations)
- `packages/web/src/lib/stores/ring-store.ts` — modify (debate state, history, mode)

## Dependencies
- Phase 5C done (debate engine, channel messages flowing)
- Existing Ring components as base for rewrite
