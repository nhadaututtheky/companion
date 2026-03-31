# Phase 3: Web App UX Overhaul

## Goal

Make the web app usable on mobile, add proper auth flow, and close critical UX gaps. Web is secondary to Telegram but still needs to be functional.

## Tasks

### Auth / Login
- [ ] Create `/login` page — simple form: enter API key, validate against server, store in localStorage
  - `packages/web/src/app/login/page.tsx` — new
  - On success: redirect to `/`
  - On fail: show error "Invalid API key"
- [ ] Add auth guard middleware — redirect to `/login` if no API key in localStorage
  - Check on app mount in root layout or a provider
- [ ] Show "Connected as..." indicator in sidebar with key preview (first 4 chars)

### Mobile Responsive
- [ ] Sidebar: collapse to hamburger on `md` breakpoint (768px)
  - Toggle button in header
  - Overlay sidebar on mobile
- [ ] Session grid: single column on mobile, 2 columns on tablet
- [ ] Expanded session view: full-screen on mobile (hide sidebar + grid)
- [ ] Touch targets: ensure all buttons ≥ 44x44px
- [ ] Chat input: sticky bottom, safe area for mobile keyboards

### Cost Display Fix
- [ ] Replace hardcoded rate with model-specific rates
  - Haiku: $0.25/$1.25 per 1M tokens
  - Sonnet: $3/$15 per 1M tokens
  - Opus: $15/$75 per 1M tokens
- [ ] Show model name next to cost estimate

### Notifications
- [ ] Add browser notification permission request on first visit
- [ ] Send notification when: session completes, session errors, permission needed
- [ ] Add sound toggle in settings (default: off)

### Keyboard Shortcuts
- [ ] `Ctrl+Enter` — send message
- [ ] `Ctrl+S` — stop current session
- [ ] `Ctrl+K` — quick session search / command palette
- [ ] `Escape` — close expanded panels
- [ ] `Ctrl+1-6` — switch between visible sessions

## Acceptance Criteria

- [ ] New user → sees login page → enters API key → redirected to dashboard
- [ ] Web app usable on 375px width (iPhone SE)
- [ ] Cost shows correct rate per model
- [ ] Browser notifications fire on session complete
- [ ] All keyboard shortcuts work

## Files Touched

- `packages/web/src/app/login/page.tsx` — new
- `packages/web/src/app/page.tsx` — responsive layout, auth guard
- `packages/web/src/app/layout.tsx` — auth provider
- `packages/web/src/components/session-grid.tsx` — responsive grid
- `packages/web/src/components/sidebar.tsx` — collapsible
- `packages/web/src/hooks/use-session.ts` — fix cost calculation
- `packages/web/src/hooks/use-notifications.ts` — new
- `packages/web/src/hooks/use-keyboard-shortcuts.ts` — new/enhanced

## Dependencies

- Phase 1 completed

## Review Gate

- [ ] `bun run build` passes (web)
- [ ] Manual test: open on mobile viewport → layout not broken
- [ ] Manual test: no API key → redirected to login
- [ ] Manual test: session completes → browser notification fires
- [ ] Manual test: Ctrl+K opens command palette
