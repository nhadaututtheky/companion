# Phase 3: Web UI — Calendar, Config Popover, Schedule CRUD

## Goal

Build the schedule management UI: a calendar showing upcoming runs, CRUD forms for schedules,
and consolidate the session config popover with telegram target + schedule link.

## Tasks

### Schedule Management Page
- [ ] Create `packages/web/src/app/schedules/page.tsx` — schedule list + calendar view
- [ ] Create `packages/web/src/components/schedule/schedule-list.tsx` — table of all schedules
- [ ] Create `packages/web/src/components/schedule/schedule-form.tsx` — create/edit form (modal)
- [ ] Create `packages/web/src/components/schedule/schedule-calendar.tsx` — month grid with dots
- [ ] Create `packages/web/src/components/schedule/cron-builder.tsx` — visual cron expression helper
- [ ] Add nav link to schedules page in sidebar — `packages/web/src/components/layout/sidebar.tsx`

### Session Config Popover Enhancement
- [ ] Extend `packages/web/src/components/grid/session-settings.tsx` — add telegram target section
- [ ] Add telegram target selector component (off / private / group+topic dropdown)
- [ ] Add "Create Schedule" shortcut link in popover (pre-fills project + model from session)

### Zustand Store
- [ ] Create `packages/web/src/stores/schedule-store.ts` — schedule list, CRUD ops, upcoming runs

### Calendar Component Design
- [ ] Month grid: 7 columns (Mon-Sun), 5-6 rows
- [ ] Each day cell shows colored dots (1 dot per scheduled run)
- [ ] Click day to see run details in a side panel
- [ ] Color coding: green=completed, blue=upcoming, red=failed, gray=disabled
- [ ] Today highlighted with accent border
- [ ] Navigation: prev/next month arrows

## Component Tree

```
SchedulesPage
  ├── ScheduleCalendar (month grid + dots)
  ├── ScheduleList (table: name, project, trigger, next run, toggle, actions)
  └── ScheduleFormModal (create/edit)
       ├── ProjectSelector (reuse existing)
       ├── ModelSelector (reuse from session/model-selector.tsx)
       ├── TriggerConfig (once: datetime picker | cron: cron-builder)
       ├── TelegramTargetSelector (off/private/group)
       └── AutoStopRules (budget, max turns, duration)

SessionSettingsPopover (existing — extend)
  ├── ...existing sections (timeout, compact, budget)
  ├── TelegramTargetSelector (new section)
  └── ScheduleLink ("Schedule recurring" → opens /schedules with pre-fill)
```

## Acceptance Criteria

- [ ] Schedules page renders list of all schedules with correct data
- [ ] Calendar shows dots on days with scheduled runs
- [ ] Create form validates all fields (cron syntax, required project, etc.)
- [ ] Edit form pre-fills all fields from existing schedule
- [ ] Toggle switch enables/disables schedule inline
- [ ] Delete with confirmation dialog
- [ ] Session settings popover shows telegram target section for active sessions
- [ ] "Schedule recurring" link opens form pre-filled with session context
- [ ] Responsive layout: calendar stacks above list on mobile
- [ ] All interactive elements have focus-visible + aria-labels

## Files Touched

- `packages/web/src/app/schedules/page.tsx` — new
- `packages/web/src/components/schedule/schedule-list.tsx` — new
- `packages/web/src/components/schedule/schedule-form.tsx` — new
- `packages/web/src/components/schedule/schedule-calendar.tsx` — new
- `packages/web/src/components/schedule/cron-builder.tsx` — new
- `packages/web/src/components/schedule/telegram-target-selector.tsx` — new
- `packages/web/src/stores/schedule-store.ts` — new
- `packages/web/src/components/grid/session-settings.tsx` — modify (telegram + schedule link)
- `packages/web/src/components/layout/sidebar.tsx` — modify (add nav link)

## Dependencies

- Requires Phase 2 completed (REST API endpoints + api-client methods)
- Reuses `ModelSelector` from `packages/web/src/components/session/model-selector.tsx`
- Reuses project data from existing Zustand stores
