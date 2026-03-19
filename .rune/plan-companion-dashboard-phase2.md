# Phase 2: Multi-Session Grid

## Goal
Replace the single-session 3-column layout with a grid showing up to 6 active sessions as mini-terminals. Each session card shows header, message feed, input composer, and permission gates. Grid layout adapts: 1=full, 2=2col, 3-4=2x2, 5-6=3x2.

## Tasks

### 2.1 Create Grid Layout Component
- [x] Create `packages/web/src/components/grid/session-grid.tsx`
- [x] Props: `sessions: SessionCard[]`, `onExpand: (id) => void`, `onSelect: (id) => void`
- [x] Grid logic via CSS grid:
  - 1 session: `grid-cols-1`
  - 2 sessions: `grid-cols-2`
  - 3-4 sessions: `grid-cols-2` (2x2, last row may have 1)
  - 5-6 sessions: `grid-cols-3` (3x2)
- [x] Each cell has min-height 300px, fills available space
- [x] Responsive: on mobile (<768px) always 1 column

### 2.2 Create Mini-Terminal Component
- [x] Create `packages/web/src/components/grid/mini-terminal.tsx`
- [x] Header bar: project name (truncated), model badge, status dot (green/yellow/red), expand icon (ArrowsOut from Phosphor)
- [x] Message feed: scrollable, auto-scroll to bottom, compact messages (smaller font, less padding)
- [x] Input composer: single-line textarea that grows to max 3 lines, send on Enter
- [x] Permission gate: compact inline bar (tool name + Allow/Deny buttons)
- [x] Uses `useSession(sessionId)` hook per card — each card has its own WS connection
- [x] Status dot colors: idle=#34A853, busy=#4285F4, waiting=#FBBC04, ended=#9AA0A6

### 2.3 Create Session Card Header
- [x] Create `packages/web/src/components/grid/session-header.tsx`
- [x] Left: status dot + project name (font-semibold, truncate)
- [x] Center: model badge (text-xs, muted bg, rounded-full)
- [x] Right: expand button (ArrowsOut icon, 20px), stop button (X icon, 16px, danger on hover)
- [x] Border-bottom separator, padding 8px 12px

### 2.4 Refactor Dashboard Page
- [x] Replace `ThreeColumn` with new grid layout on dashboard (`/`)
- [x] Keep sidebar for session list (left panel, collapsible)
- [x] Main area: `SessionGrid` with all active sessions
- [x] Right panel: removed (stats move to header or sidebar top)
- [x] "New Session" button prominent in header or sidebar
- [x] When no sessions: show EmptyCenter with "Start your first session" CTA
- [x] Move `StatsGrid` into sidebar top area (compact: active count + cost only)

### 2.5 Update Session Store for Multi-Session
- [x] Add `expandedSessionId: string | null` to session store
- [x] Add `setExpandedSession(id: string | null)` action
- [x] Add `gridOrder: string[]` — ordered list of session IDs for grid placement
- [x] Add `addToGrid(id)`, `removeFromGrid(id)`, `reorderGrid(ids)` actions

### 2.6 Compact Message Rendering
- [x] Create `packages/web/src/components/grid/compact-message.tsx`
- [x] Smaller than full MessageFeed: 12px font, 4px padding, no avatars
- [x] User messages: right-aligned, accent bg
- [x] Assistant messages: left-aligned, card bg
- [x] Tool use blocks: collapsed single-line (icon + tool name + status)
- [x] Streaming indicator: pulsing dot after last message

## Acceptance Criteria
- [x] Dashboard shows grid of active sessions (1-6)
- [x] Grid layout adapts correctly for 1, 2, 3, 4, 5, 6 sessions
- [x] Each mini-terminal shows live streaming messages
- [x] Can type and send messages from any mini-terminal
- [x] Permission requests appear inline in each card
- [x] Expand button is visible and clickable (wired in Phase 3)
- [x] Sidebar shows session list for quick navigation
- [x] Mobile: single column layout

## Files Touched
- `packages/web/src/components/grid/session-grid.tsx` — new
- `packages/web/src/components/grid/mini-terminal.tsx` — new
- `packages/web/src/components/grid/session-header.tsx` — new
- `packages/web/src/components/grid/compact-message.tsx` — new
- `packages/web/src/app/page.tsx` — refactor to use grid layout
- `packages/web/src/lib/stores/session-store.ts` — add grid state
- `packages/web/src/components/dashboard/stats-grid.tsx` — compact variant
- `packages/web/src/app/globals.css` — mobile grid media query

## Dependencies
- Phase 1 completed (WS fix, session_init handling, session limit)
