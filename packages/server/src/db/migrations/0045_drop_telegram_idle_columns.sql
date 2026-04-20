-- Session settings unification — Phase 3 cleanup.
-- Migration 0044 added idle_timeout_ms / idle_timeout_enabled to `sessions`
-- and backfilled values from `telegram_session_mappings`. Phase 2/3 code
-- reads + writes those settings exclusively through SessionSettingsService,
-- which targets the `sessions` row. The mapping-table columns have been
-- dead since Phase 2 landed; this migration completes the cleanup.
--
-- Safety: grep audit (scripts/check-settings-consistency.ts) blocks any
-- code from writing to these columns. The only remaining reader was the
-- bootstrap path in telegram-persistence.ts, updated to use the service
-- in the same commit as this migration.
--
-- Rollback: re-create columns + re-run backfill from `sessions`. SQLite
-- does support DROP COLUMN from v3.35 (2021), so forward migration is
-- native; down migration would need an explicit ADD COLUMN.
-- Non-idempotent: embedded migration runner tracks by file name.

ALTER TABLE telegram_session_mappings DROP COLUMN idle_timeout_ms;
--> statement-breakpoint
ALTER TABLE telegram_session_mappings DROP COLUMN idle_timeout_enabled;
