# Phase 4: Web UI Core

## Goal
Build the Next.js 16 frontend with dashboard and session terminal. After this phase, users can monitor and control sessions from the browser.

## Tasks
- [ ] Scaffold Next.js 16 app in `packages/web/`
- [ ] Configure TailwindCSS 4 with custom theme (Palette B, dark mode first)
- [ ] Install and configure shadcn/ui
- [ ] Set up Phosphor Icons (`@phosphor-icons/react`)
- [ ] Set up fonts: Space Grotesk, Inter, JetBrains Mono
- [ ] Create root layout with dark mode support
- [ ] Build sidebar navigation component
- [ ] Build header with status indicators
- [ ] Build command palette (Cmd+K)
- [ ] Create Zustand stores:
  - [ ] `session-store.ts` -- active sessions, selected session
  - [ ] `ui-store.ts` -- sidebar collapsed, theme, command palette open
- [ ] Create hooks:
  - [ ] `use-websocket.ts` -- WebSocket connection manager with auto-reconnect
  - [ ] `use-session.ts` -- session data + WS integration
  - [ ] `use-api.ts` -- fetch wrapper for server API
- [ ] Build Dashboard page (`/`):
  - [ ] Active sessions list (live status)
  - [ ] Cost summary cards (today, week, total)
  - [ ] Recent activity feed
  - [ ] Quick action buttons (new session, open project)
- [ ] Build Session List page (`/sessions`):
  - [ ] Filterable list (active/ended/all)
  - [ ] Session cards with status, model, cost, turns
  - [ ] Search/filter
- [ ] Build Session Terminal page (`/sessions/[id]`):
  - [ ] Message feed with markdown rendering
  - [ ] User message composer
  - [ ] Permission gate (approve/deny with countdown)
  - [ ] Context meter (token usage bar)
  - [ ] Session header (model, status, cost, project)
  - [ ] File operations inline display
  - [ ] Streaming text support
  - [ ] Tool progress indicators
- [ ] Build Projects page (`/projects`):
  - [ ] Project cards with stats
  - [ ] Add/edit project dialog
- [ ] Add skeleton loaders for all async data
- [ ] Add Sonner toast notifications
- [ ] Responsive design (mobile-friendly)
- [ ] Configure proxy to server API in next.config.ts (dev mode)

## Acceptance Criteria
- [ ] `bun dev` starts both server and Next.js
- [ ] Dashboard shows active sessions in real-time
- [ ] Can navigate to session and see live message feed
- [ ] Can type messages and send to CLI
- [ ] Permission requests appear with Allow/Deny/countdown
- [ ] Context meter updates as tokens accumulate
- [ ] Cost displays update after each turn
- [ ] Dark mode is default, light mode toggleable
- [ ] Mobile layout works (sidebar collapses)
- [ ] No gradient blob heroes, no default indigo, Phosphor icons used

## Files Touched
- `packages/web/package.json` -- new
- `packages/web/next.config.ts` -- new
- `packages/web/tailwind.config.ts` -- new
- `packages/web/src/app/layout.tsx` -- new
- `packages/web/src/app/page.tsx` -- new (dashboard)
- `packages/web/src/app/sessions/page.tsx` -- new
- `packages/web/src/app/sessions/[id]/page.tsx` -- new
- `packages/web/src/app/projects/page.tsx` -- new
- `packages/web/src/components/ui/` -- new (shadcn components)
- `packages/web/src/components/layout/sidebar.tsx` -- new
- `packages/web/src/components/layout/header.tsx` -- new
- `packages/web/src/components/layout/command-palette.tsx` -- new
- `packages/web/src/components/session/terminal.tsx` -- new
- `packages/web/src/components/session/message-feed.tsx` -- new
- `packages/web/src/components/session/permission-gate.tsx` -- new
- `packages/web/src/components/session/context-meter.tsx` -- new
- `packages/web/src/components/dashboard/stats-grid.tsx` -- new
- `packages/web/src/components/dashboard/session-timeline.tsx` -- new
- `packages/web/src/hooks/use-websocket.ts` -- new
- `packages/web/src/hooks/use-session.ts` -- new
- `packages/web/src/lib/stores/session-store.ts` -- new
- `packages/web/src/lib/stores/ui-store.ts` -- new
- `packages/web/src/lib/api-client.ts` -- new
- `packages/web/src/styles/globals.css` -- new

## Dependencies
- Requires Phase 2 completed (sessions API, WebSocket endpoint)
- Phase 3 (Telegram) is parallel -- not a dependency
