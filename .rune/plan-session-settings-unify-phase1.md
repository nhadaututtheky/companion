# Phase 1: Schema Unification + Default Consolidation

## Goal

Thêm tất cả session settings columns còn thiếu vào `sessions` table, backfill từ `telegramSessionMappings`, consolidate mọi default value về `@companion/shared/constants.ts`. KHÔNG đổi writer/reader logic ở phase này — chỉ chuẩn bị DB + constants, code hiện tại vẫn chạy.

## Scope

Pure DB + constants work. Không touch service layer, route, UI ở phase này.

## Tasks

- [x] **Constants consolidation** — `packages/shared/src/constants.ts`:
  - Confirm `SESSION_IDLE_TIMEOUT_MS` = `30 * 60 * 1000` là source of truth
  - Add: `DEFAULT_KEEP_ALIVE = false`, `DEFAULT_AUTO_REINJECT_ON_COMPACT = true`, `DEFAULT_THINKING_MODE = "adaptive"`, `DEFAULT_CONTEXT_MODE = "200k"`, `DEFAULT_COMPACT_MODE = "manual"`, `DEFAULT_COMPACT_THRESHOLD = 75`
  - Add JSDoc warning: "MUST match DB migration defaults — update both together"

- [x] **Migration `0044_session_settings_unify.sql`**:
  ```sql
  ALTER TABLE sessions ADD COLUMN idle_timeout_ms INTEGER NOT NULL DEFAULT 1800000;
  ALTER TABLE sessions ADD COLUMN idle_timeout_enabled INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE sessions ADD COLUMN keep_alive INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sessions ADD COLUMN auto_reinject_on_compact INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE sessions ADD COLUMN thinking_mode TEXT NOT NULL DEFAULT 'adaptive';
  ALTER TABLE sessions ADD COLUMN context_mode TEXT NOT NULL DEFAULT '200k';
  ```
  Backfill bằng UPDATE từ `telegram_session_mappings` cho session có mapping:
  ```sql
  UPDATE sessions SET
    idle_timeout_ms = (SELECT m.idle_timeout_ms FROM telegram_session_mappings m WHERE m.session_id = sessions.id LIMIT 1),
    idle_timeout_enabled = (SELECT m.idle_timeout_enabled FROM telegram_session_mappings m WHERE m.session_id = sessions.id LIMIT 1)
  WHERE EXISTS (SELECT 1 FROM telegram_session_mappings m WHERE m.session_id = sessions.id);
  ```

- [x] **Regenerate `embedded-migrations.ts`** (per feedback_embedded_migrations.md — bắt buộc sau khi add SQL file).

- [x] **Drizzle schema update** — `packages/server/src/db/schema.ts`:
  - Thêm 6 columns vào `sessions` table definition
  - GIỮ NGUYÊN `telegram_session_mappings.idle_timeout_ms` ở phase này (sẽ drop ở phase 3)
  - JSDoc comment mỗi cột: "See @companion/shared constants for default value"

- [x] **Type update** — `packages/shared/src/types/session.ts`:
  - Extend `SessionSettings` type với tất cả 6 fields
  - Extend `SessionState` type nếu cần (hoặc tách riêng `SessionSettings` ra khỏi `SessionState` — đánh giá xem type nào cleaner)

- [x] **Unit test migration backfill** — `packages/server/src/db/__tests__/migration-0044.test.ts`:
  - Seed pre-migration DB: 1 session + 1 mapping với `idle_timeout_ms = 600000`
  - Run migration
  - Assert `sessions.idle_timeout_ms === 600000`
  - Seed: 1 session, no mapping → assert `idle_timeout_ms === 1800000` (default)

## Acceptance Criteria

- [x] Migration apply trên test DB không lỗi (migration-0044.test.ts — 4/4 pass)
- [ ] `bunx drizzle-kit generate` không emit diff sau khi update schema.ts — SKIPPED (schema dùng custom SQL migration, không cần drizzle-kit emit)
- [x] 7 constants mới export từ `@companion/shared` (DEFAULT_IDLE_TIMEOUT_ENABLED, DEFAULT_KEEP_ALIVE, DEFAULT_AUTO_REINJECT_ON_COMPACT, DEFAULT_THINKING_MODE, DEFAULT_CONTEXT_MODE, DEFAULT_COMPACT_MODE, DEFAULT_COMPACT_THRESHOLD)
- [x] `bunx tsc --noEmit` clean ở cả `server`, `web`, `shared`
- [x] `bun test` pass (805 tests, 0 fail across server+web)
- [ ] Grep hardcoded numerics — DEFERRED tới Phase 2/3 (Phase 1 là additive only, không chạm writer/reader)

## Files Touched

- `packages/shared/src/constants.ts` — add 6 constants
- `packages/shared/src/types/session.ts` — extend SessionSettings
- `packages/server/src/db/schema.ts` — add 6 columns to sessions
- `packages/server/src/db/migrations/0044_session_settings_unify.sql` — new
- `packages/server/src/db/migrations/meta/_journal.json` — drizzle auto-update
- `packages/server/src/db/embedded-migrations.ts` — regenerate
- `packages/server/src/db/__tests__/migration-0044.test.ts` — new (~40 LOC)

## Dependencies

None. Đi trước Phase 2 và 3.

## Non-Goals

- KHÔNG touch writer/reader service ở phase này
- KHÔNG drop `telegram_session_mappings.idle_timeout_ms` (giữ để Phase 2 vẫn đọc được)
- KHÔNG thêm `SessionSettingsService` — đó là Phase 2

## Risks

- **Migration performance**: backfill UPDATE với correlated subquery có thể chậm nếu có >10K sessions. Mitigation: batch theo id range nếu cần, nhưng production DB thường <1K sessions.
- **Type drift**: nếu `SessionSettings` type khác với DB columns, TS không phát hiện. Mitigation: test case so sánh `keyof SessionSettings` với `Object.keys(sessionsTable)`.
