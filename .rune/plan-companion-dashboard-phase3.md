# Phase 3: Expand/Collapse Glassmorphism Cards

## Goal
When user clicks expand on a mini-terminal, it opens as a glassmorphism overlay card with full terminal features. Collapse returns to grid position. Smooth animation, keyboard support (Esc to close).

## Tasks

### 3.1 Create Expanded Session Overlay
- [x] Create `packages/web/src/components/grid/expanded-session.tsx`
- [x] Renders as a portal (React.createPortal to document.body)
- [x] Backdrop: semi-transparent dark overlay (`rgba(0,0,0,0.5)`, click to close)
- [x] Card: glassmorphism style
  - `background: rgba(255,255,255,0.05)` (dark) / `rgba(255,255,255,0.85)` (light)
  - `backdrop-filter: blur(16px)`
  - `border: 1px solid rgba(255,255,255,0.12)`
  - `border-radius: 16px`
  - `box-shadow: 0 8px 32px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.08)`
- [x] Size: 80vw x 80vh, centered, max-width 1200px
- [x] Animate in: scale(0.95) + opacity(0) -> scale(1) + opacity(1), 250ms ease-out
- [x] Animate out: reverse, 200ms ease-in

### 3.2 Full Terminal View in Expanded Card
- [x] Header: project name, model selector dropdown, status badge, cost display, collapse button (ArrowsIn)
- [x] Full MessageFeed component (reuse existing, not compact version)
- [x] Full MessageComposer (multi-line, auto-resize)
- [x] Full PermissionGate (with tool details, input preview)
- [x] ContextMeter at top (token usage bar)
- [x] Session details sidebar (right side, 280px): files read/modified/created, turns, cost breakdown

### 3.3 Keyboard Navigation
- [x] Esc key closes expanded view
- [x] Focus trap inside expanded card (tab cycles within)
- [x] Auto-focus composer textarea on expand
- [x] Ctrl+Enter sends message (same as mini-terminal)

### 3.4 Animation Utilities
- [x] Create `packages/web/src/lib/animation.ts`
- [x] `useAnimatePresence(isVisible)` hook — returns `shouldRender` + `animationClass`
- [x] CSS classes in globals.css: `.glass-enter`, `.glass-exit`, `.glass-backdrop-enter`, `.glass-backdrop-exit`
- [x] Respect `prefers-reduced-motion` — skip animation, instant show/hide

### 3.5 Wire Expand/Collapse to Grid
- [x] In `session-grid.tsx`: `onExpand` sets `expandedSessionId` in store
- [x] In dashboard `page.tsx`: render `ExpandedSession` when `expandedSessionId` is set
- [x] Collapse button + Esc + backdrop click: set `expandedSessionId` to null
- [x] Grid cards dim slightly when one is expanded (opacity 0.6)

## Acceptance Criteria
- [x] Clicking expand on mini-terminal opens glassmorphism overlay
- [x] Overlay has full terminal view with message feed, composer, permissions
- [x] Esc closes overlay, backdrop click closes overlay
- [x] Animation is smooth (scale + opacity transition)
- [x] Focus trap works (Tab stays within overlay)
- [x] `prefers-reduced-motion` disables animation
- [x] Grid cards dim when overlay is open
- [x] Dark mode and light mode both render correctly

## Files Touched
- `packages/web/src/components/grid/expanded-session.tsx` — new
- `packages/web/src/lib/animation.ts` — new
- `packages/web/src/app/globals.css` — add glass animation classes
- `packages/web/src/app/page.tsx` — render expanded overlay
- `packages/web/src/components/grid/session-grid.tsx` — dim cards when expanded
- `packages/web/src/components/session/message-composer.tsx` — add Ctrl+Enter support

## Dependencies
- Phase 2 completed (grid layout, mini-terminal, session store with expandedSessionId)
