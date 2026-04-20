# Phase 2: Single-Writer Service + Event Bus Propagation

## Goal

Tạo `SessionSettingsService` là writer duy nhất. Mọi UPDATE settings → DB trước → emit event → cache subscribe và invalidate. Xoá bỏ `sessionSettings` Map + `sessionConfigs` Map làm writer, chỉ còn làm read cache với TTL + event-driven invalidation.

## Scope

Server-side service layer + event bus integration. Chưa đụng resume path (Phase 3). Web UI chỉ cần refetch theo event.

## Tasks

- [ ] **Service skeleton** — `packages/server/src/services/session-settings-service.ts`:
  ```ts
  export class SessionSettingsService {
    async get(sessionId: string): Promise<SessionSettings>  // read DB, cache 30s
    async update(sessionId: string, patch: Partial<SessionSettings>): Promise<SessionSettings>
      // 1. validate (zod schema)
      // 2. DB UPDATE sessions SET ...
      // 3. invalidate own cache
      // 4. emit eventBus.emit('session:settings:updated', { sessionId, settings })
    async applyDefaults(sessionId: string): Promise<void>  // called on insert
  }
  ```
  Không dùng Map<sessionId, SessionSettings> làm writer — luôn ghi DB rồi invalidate.

- [ ] **Event type** — `packages/server/src/services/event-bus.ts`:
  - Add event: `'session:settings:updated'` payload `{ sessionId: string, settings: SessionSettings }`

- [ ] **Subscribers** — replace existing writers:
  - `ws-bridge.ts:315-340` (`setSessionSettings`): thay vì ghi Map trực tiếp → gọi `SessionSettingsService.update()` → subscribe event để update read-cache Map
  - `telegram-idle-manager.ts:97-116` (`persistIdleTimeout`): bỏ DB UPDATE trực tiếp → gọi `SessionSettingsService.update()` → subscribe event để refresh `sessionConfigs` Map
  - `session-store.ts:659` (`updateSessionConfig`): merge logic vào `SessionSettingsService.update()`

- [ ] **Reader migration** — mọi chỗ đọc settings:
  - `ws-health-idle.ts:170-212` → đọc qua `SessionSettingsService.get(sessionId)`
  - `telegram-idle-manager.ts:58-65` (`getSessionConfig`) → đọc qua service
  - `ws-user-message.ts:149,173` (thinking_mode, context_mode) → đọc qua service
  - `scheduler.ts:235` → đọc qua service thay vì set Map

- [ ] **Web API unification** — `routes/sessions.ts`:
  - `PATCH /:id/settings` (line 484) → delegate `SessionSettingsService.update()`
  - `PATCH /:id/config` (line 523) → delegate `SessionSettingsService.update()` — **gộp 2 endpoint thành 1** (breaking change internal, nhưng 2 endpoint này overlap, không có external consumer)
  - Return value: full updated settings object để client cache được

- [ ] **Web UI event subscription** — `packages/web/src/hooks/use-session-settings.ts` (new):
  - Hook wraps `GET /sessions/:id/settings`
  - Subscribe WS event `session:settings:updated` → auto-refetch
  - Optimistic update khi user save

- [ ] **Broadcast WS event** — khi `session:settings:updated` emit từ event bus, `ws-broadcast.ts` relay xuống tất cả client đang view session đó

- [ ] **Feature flag** — `FEATURE_SESSION_SETTINGS_V2` env var:
  - Default `false` ở phase này (code mới coexist với code cũ)
  - Khi `true`: tất cả writer/reader đi qua service
  - Khi `false`: giữ nguyên behavior cũ (rollback path)

- [ ] **Integration test** — `packages/server/src/services/__tests__/session-settings-service.test.ts`:
  - Test 1: `update()` ghi DB thành công
  - Test 2: `update()` emit event
  - Test 3: 2 subscriber Map đều được invalidate sau event
  - Test 4: Concurrent update không lost-update (last-write-wins hoặc optimistic lock)
  - Test 5: Cache TTL — update từ service khác → `get()` trả giá trị mới trong ≤1s

## Acceptance Criteria

- [ ] Grep `sessionSettings.set(` outside service layer = 0 hit
- [ ] Grep `sessionConfigs.set(` outside `TelegramIdleManager` internal (subscriber only) = 0 hit
- [ ] Grep `UPDATE telegram_session_mappings SET idle_timeout` = 0 hit (all writes go qua `sessions` table)
- [ ] Feature flag ON: `bun test` pass
- [ ] Feature flag OFF: backwards-compat, `bun test` pass với code cũ
- [ ] Web UI: user save setting → 2 tab khác cùng session refresh trong 1s

## Files Touched

- `packages/server/src/services/session-settings-service.ts` — new (~200 LOC)
- `packages/server/src/services/event-bus.ts` — add event type
- `packages/server/src/services/ws-bridge.ts` — replace setSessionSettings body
- `packages/server/src/services/ws-health-idle.ts` — reader migration
- `packages/server/src/telegram/telegram-idle-manager.ts` — replace persistIdleTimeout
- `packages/server/src/services/session-store.ts` — deprecate updateSessionConfig
- `packages/server/src/services/scheduler.ts` — reader migration
- `packages/server/src/routes/sessions.ts` — unify 2 endpoints
- `packages/web/src/hooks/use-session-settings.ts` — new (~80 LOC)
- `packages/web/src/components/grid/session-settings.tsx` — use new hook
- `packages/server/src/services/__tests__/session-settings-service.test.ts` — new (~150 LOC)

## Dependencies

Requires Phase 1 completed (DB columns exist).

## Non-Goals

- KHÔNG drop `telegram_session_mappings.idle_timeout_ms` (Phase 3)
- KHÔNG fix resume path logic (Phase 3 sẽ dùng service mới)
- KHÔNG remove feature flag (Phase 3)

## Risks

- **Breaking internal API**: `PATCH /:id/config` và `PATCH /:id/settings` gộp lại — kiểm tra không có consumer ngoài Web UI.
- **Event bus recursion**: writer emit event → subscriber invalidate cache → invalidate không được ghi DB lại để tránh loop. Test case bắt buộc.
- **Cache TTL vs event latency**: nếu event bus delay, stale read. Mitigation: cache TTL ngắn (30s) + event-driven invalidation (faster than TTL).
