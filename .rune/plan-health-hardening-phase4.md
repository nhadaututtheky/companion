# Phase 4: God File Cleanup

## Goal
Split remaining god files: telegram-bridge (2,254 LOC), settings-tabs (1,996 LOC), new-session-modal (1,452 LOC).

## Tasks

### 4A — Split telegram-bridge.ts
- [ ] T4.1 — Extract `telegram-message-formatter.ts`
  - Move: message formatting, markdown→Telegram HTML conversion, truncation
  - `packages/server/src/telegram/telegram-message-formatter.ts` — new

- [ ] T4.2 — Extract `telegram-stream-handler.ts`
  - Move: streaming logic, edit-in-place updates, flush timers
  - `packages/server/src/telegram/telegram-stream-handler.ts` — new

- [ ] T4.3 — Extract `telegram-debate-handler.ts`
  - Move: debate routing, forum topic management, multi-agent thread handling
  - `packages/server/src/telegram/telegram-debate-handler.ts` — new

- [ ] T4.4 — Slim `telegram-bridge.ts` to orchestrator (~500 LOC)

### 4B — Split settings-tabs.tsx
- [ ] T4.5 — Extract individual tab components
  - `packages/web/src/components/settings/general-tab.tsx` — new
  - `packages/web/src/components/settings/appearance-tab.tsx` — new
  - `packages/web/src/components/settings/sessions-tab.tsx` — new
  - `packages/web/src/components/settings/telegram-tab.tsx` — new
  - `packages/web/src/components/settings/security-tab.tsx` — new
  - `packages/web/src/components/settings/advanced-tab.tsx` — new
  - `packages/web/src/components/settings/about-tab.tsx` — new

- [ ] T4.6 — Refactor `settings-tabs.tsx` to tab router (~100 LOC)
  - Lazy-load each tab component
  - `packages/web/src/components/settings/settings-tabs.tsx` — refactor

### 4C — Split new-session-modal.tsx
- [ ] T4.7 — Extract sub-forms
  - `packages/web/src/components/session/modal/project-picker.tsx` — new
  - `packages/web/src/components/session/modal/template-selector.tsx` — new
  - `packages/web/src/components/session/modal/persona-selector.tsx` — new
  - `packages/web/src/components/session/modal/variable-form.tsx` — new
  - `packages/web/src/components/session/modal/platform-selector.tsx` — new

- [ ] T4.8 — Slim `new-session-modal.tsx` to orchestrator (~300 LOC)

- [ ] T4.9 — Verify build passes

## Acceptance Criteria
- [ ] telegram-bridge.ts under 600 LOC
- [ ] settings-tabs.tsx under 150 LOC
- [ ] new-session-modal.tsx under 400 LOC
- [ ] All extracted components individually importable
- [ ] No visual regressions in UI
- [ ] Build passes

## Files Touched
- `packages/server/src/telegram/` — 4 new files, 1 refactored
- `packages/web/src/components/settings/` — 7 new files, 1 refactored
- `packages/web/src/components/session/modal/` — 5 new files, 1 refactored

## Dependencies
- Phase 3 complete (ws-bridge split establishes the extraction pattern)
