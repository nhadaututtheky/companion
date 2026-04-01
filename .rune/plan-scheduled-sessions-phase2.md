# Phase 2: REST API + Telegram Target Config

## Goal

Expose schedule CRUD via REST API. Add per-session telegram target to session creation flow.
Schedules can specify their own telegram target that auto-attaches on session launch.

## Tasks

- [ ] Create `packages/server/src/routes/schedules.ts` — full CRUD routes
- [ ] Register schedule routes in `packages/server/src/routes/index.ts` at `/api/schedules`
- [ ] Add Zod validation schemas for schedule create/update
- [ ] Add `telegramTarget` field to `createSessionSchema` in `packages/server/src/routes/sessions.ts`
- [ ] Wire telegram auto-attach in scheduler — when schedule has telegram target, call `tgBridge.attachStreamToSession()` after launch
- [ ] Add `GET /api/schedules/upcoming` — next 20 runs across all schedules (for calendar)
- [ ] Add `POST /api/schedules/:id/run-now` — manual trigger (bypass schedule time)
- [ ] Add `PATCH /api/schedules/:id/toggle` — enable/disable shortcut
- [ ] Add schedule API methods to `packages/web/src/lib/api-client.ts`
- [ ] Export schedule types from shared package

## API Endpoints

```
GET    /api/schedules              — list all (with pagination)
POST   /api/schedules              — create schedule
GET    /api/schedules/:id          — get one
PATCH  /api/schedules/:id          — update schedule
DELETE /api/schedules/:id          — delete schedule
PATCH  /api/schedules/:id/toggle   — toggle enabled
POST   /api/schedules/:id/run-now  — manual trigger
GET    /api/schedules/upcoming     — next N runs (computed from cron)
```

## Zod Schemas

```typescript
const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  projectSlug: z.string().optional(),
  prompt: z.string().max(10000).optional(),
  templateId: z.string().optional(),
  templateVars: z.record(z.string()).optional(),
  model: z.enum(ALLOWED_MODELS),
  permissionMode: z.enum(['default','acceptEdits','bypassPermissions','plan']).optional(),
  triggerType: z.enum(['once', 'cron']),
  cronExpression: z.string().max(100).optional(),
  scheduledAt: z.number().optional(),
  timezone: z.string().max(50).default('UTC'),
  telegramTarget: z.object({
    mode: z.enum(['off', 'private', 'group']),
    botId: z.string().optional(),
    chatId: z.number().optional(),
    topicId: z.number().optional(),
  }).optional(),
  autoStopRules: z.object({
    maxCostUsd: z.number().optional(),
    maxTurns: z.number().int().optional(),
    maxDurationMs: z.number().int().optional(),
  }).optional(),
});
```

## Telegram Target Flow

1. Schedule has `telegramTarget: { mode: 'group', chatId: 123, topicId: 456 }`
2. Scheduler launches session via `WsBridge.startSession()`
3. After session starts, scheduler calls `botRegistry.getPrimary().attachStreamToSession(sessionId, chatId, topicId)`
4. Stream handler automatically routes AI responses to that Telegram chat/topic
5. Same flow works for manual session creation with `telegramTarget` in POST body

## Acceptance Criteria

- [ ] All 8 API endpoints respond correctly with proper validation
- [ ] Creating a schedule with invalid cron returns 400
- [ ] Toggle endpoint flips enabled and recomputes nextRunAt
- [ ] Run-now bypasses schedule time and launches immediately
- [ ] Upcoming endpoint returns correctly ordered future runs
- [ ] Session creation accepts optional telegramTarget
- [ ] Scheduled session auto-attaches telegram stream when configured
- [ ] API client methods added for web consumption

## Files Touched

- `packages/server/src/routes/schedules.ts` — new
- `packages/server/src/routes/index.ts` — modify (register schedule routes)
- `packages/server/src/routes/sessions.ts` — modify (add telegramTarget to create schema)
- `packages/server/src/services/scheduler.ts` — modify (telegram auto-attach)
- `packages/web/src/lib/api-client.ts` — modify (add schedule API methods)
- `packages/shared/src/types/schedule.ts` — modify (add API response types)

## Dependencies

- Requires Phase 1 completed (schedules table + scheduler service)
- Uses existing `BotRegistry.getPrimary().attachStreamToSession()` from telegram-bridge
