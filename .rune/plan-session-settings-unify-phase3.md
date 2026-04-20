# Phase 3: Resume Path Cleanup + Contract Tests + Deprecate Old Column

## Goal

Dùng `SessionSettingsService` để unify mọi resume path. Kill hết guard lỗi (`!== 3_600_000`). Thêm contract test bắt buộc "settings persist through lifecycle". Drop `telegram_session_mappings.idle_timeout_ms` sau 1 release grace period. Bật feature flag default ON.

## Scope

Fix 5 gap đã identify trong audit. Test coverage. Migration drop cột cũ. Commit invariants mới.

## Tasks

- [ ] **Fix Gap 1 — Idle-kill không còn xóa `cliSessionId`** (`telegram-idle-manager.ts:209-218`):
  - Giữ `cliSessionId` để resume path tra cứu được settings gốc
  - Set `status = 'idle_killed'` thay vì clear `cliSessionId`
  - Update `session-state-machine.ts` để accept trạng thái này

- [ ] **Fix Gap 2 — Bỏ guard `!== 3_600_000`** (`telegram-bridge.ts:420`):
  - Luôn đọc `idleTimeoutMs` từ `sessions` table (source of truth mới) qua service
  - Không so sánh với default — nếu DB có value thì dùng

- [ ] **Fix Gap 3 — Web UI resume button truyền settings** (`packages/web/src/app/sessions/page.tsx:387`):
  - `api.sessions.resume(id)` → server đọc settings cũ từ DB trước khi tạo row mới
  - Không cần frontend truyền — server tự kế thừa

- [ ] **Fix Gap 4 — Server resume API đọc DB trước khi fallback** (`packages/server/src/routes/sessions.ts:593-608`):
  - Trước khi tạo session mới, `SELECT * FROM sessions WHERE id = ?` để lấy settings cũ
  - Body `idleTimeoutMs` chỉ override nếu user truyền explicit (không undefined)
  - KHÔNG hardcode fallback `3_600_000`

- [ ] **Fix Gap 5 — `persistMapping()` save settings khi INSERT** (`telegram-persistence.ts:115-126`):
  - Không cần nữa vì settings sống trong `sessions` table, không phải `telegram_session_mappings`
  - Xoá logic set `idleTimeoutMs` trong INSERT vào mapping table

- [ ] **Contract test suite** — `packages/server/src/__tests__/settings-lifecycle.contract.test.ts`:
  5 settings × 3 resume paths = 15 test case. Template:
  ```ts
  describe('settings persist through lifecycle', () => {
    for (const setting of SETTINGS_UNDER_TEST) {
      for (const path of RESUME_PATHS) {
        it(`${setting.name} persists via ${path.name}`, async () => {
          const sessionId = await createSession()
          await settingsService.update(sessionId, { [setting.name]: setting.testValue })
          await killSession(sessionId, 'idle')
          const newSessionId = await path.resume(sessionId)
          const settings = await settingsService.get(newSessionId)
          expect(settings[setting.name]).toBe(setting.testValue)
        })
      }
    }
  })
  ```
  Paths:
  1. Telegram `/resume` (resume_id button)
  2. Telegram `/use @shortid`
  3. Web UI resume button
  Settings: `idleTimeoutMs=600000`, `keepAlive=true`, `compactThreshold=85`, `thinking_mode=deep`, `context_mode=1m`.
  
  Mỗi contract test file chạy riêng `bun test` invocation (feedback_bun_mock_isolation.md).

- [ ] **Migration `0045_drop_telegram_idle_columns.sql`**:
  ```sql
  ALTER TABLE telegram_session_mappings DROP COLUMN idle_timeout_ms;
  ALTER TABLE telegram_session_mappings DROP COLUMN idle_timeout_enabled;
  ```
  Chỉ chạy sau khi `sessions.idle_timeout_ms` đã backfill xong (Phase 1) và service đã point sang DB mới (Phase 2).

- [ ] **Regenerate `embedded-migrations.ts`** — bắt buộc.

- [ ] **Remove feature flag** — `FEATURE_SESSION_SETTINGS_V2`:
  - Xoá toàn bộ `if (featureFlag)` branches
  - Xoá code path cũ

- [ ] **Update invariants** — `.rune/INVARIANTS.md`:
  - Add INV-13, INV-14, INV-15 (xem master plan)
  - Update INV-3 (Resume inheritance) — reference service
  - Update INV-11 (3 places state) — thay bằng "single source of truth: `sessions` table via SessionSettingsService"
  - Add vào Review Checklist: "Add new setting? → update `@companion/shared` constants + DB column + SessionSettings type + contract test"

- [ ] **Update CLAUDE.md + FEATURE_REGISTRY.md**:
  - CLAUDE.md: add danger-zone entry cho `session-settings-service.ts`
  - FEATURE_REGISTRY.md: replace `idleTimeoutMs` scattered references with single `SessionSettingsService`

- [ ] **Docs consistency** — auto-check script `scripts/check-settings-consistency.ts`:
  - Grep `@companion/shared` constants list
  - So sánh với `keyof SessionSettings` type
  - So sánh với `Object.keys(sessionsTable)`
  - Fail CI nếu mismatch

## Acceptance Criteria

- [ ] Contract test 15/15 pass
- [ ] Grep `!== 3_600_000` = 0 hit
- [ ] Grep hardcode số `1800000` / `3600000` trong code (không phải constants.ts) = 0 hit
- [ ] Feature flag removed, no `FEATURE_SESSION_SETTINGS_V2` reference
- [ ] Migration 0045 chạy trên staging không lỗi
- [ ] Manual smoke test: set timeout 10 phút → idle kill → resume từ 3 path → value vẫn đúng
- [ ] `.rune/INVARIANTS.md` cập nhật INV-13/14/15 + appendix entry cho historic fix
- [ ] `scripts/check-settings-consistency.ts` pass trong CI

## Files Touched

- `packages/server/src/telegram/telegram-idle-manager.ts` — drop cliSessionId clear
- `packages/shared/src/session-state-machine.ts` — add `idle_killed` status
- `packages/server/src/telegram/telegram-bridge.ts` — remove guard
- `packages/web/src/app/sessions/page.tsx` — simplify resume call (optional cleanup)
- `packages/server/src/routes/sessions.ts` — resume reads DB first
- `packages/server/src/telegram/telegram-persistence.ts` — drop idleTimeoutMs from persistMapping
- `packages/server/src/db/migrations/0045_drop_telegram_idle_columns.sql` — new
- `packages/server/src/db/schema.ts` — remove columns from telegramSessionMappings
- `packages/server/src/db/embedded-migrations.ts` — regenerate
- `packages/server/src/__tests__/settings-lifecycle.contract.test.ts` — new (~300 LOC)
- `.rune/INVARIANTS.md` — add 3 invariants + appendix entry
- `FEATURE_REGISTRY.md` — update references
- `CLAUDE.md` — danger zone update
- `scripts/check-settings-consistency.ts` — new (~60 LOC)

## Dependencies

Requires Phase 2 completed (service + event bus stable với feature flag ON trong prod ≥1 tuần).

## Risks

- **Rollback impossible sau phase 3**: drop cột cũ = không thể downgrade. Release 1 tuần với flag ON chỉ-đọc-DB-mới (không ghi cột cũ) trước khi drop.
- **Hidden consumer của cột cũ**: grep trước khi drop: `telegramSessionMappings.idleTimeoutMs` / `idleTimeoutEnabled` ngoài `TelegramPersistence.loadMappings()`.
- **Contract test flaky**: kill/resume async. Cần `await` đúng event bus emit + DB commit. Dùng real DB (not mock) trong test.

## Release Strategy

1. Release N: Phase 1 (schema) + Phase 2 (service, flag OFF by default)
2. Release N+1: Phase 2 với flag ON default (monitor 1 tuần)
3. Release N+2: Phase 3 (drop cột cũ + remove flag)

Total: 3 release cycles, zero-downtime, rollback-safe giữa mỗi cycle.
