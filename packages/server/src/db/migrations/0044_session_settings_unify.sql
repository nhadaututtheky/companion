-- Session settings unification — Phase 1.
-- Lift all per-session tuning knobs to `sessions` as the single source of truth.
-- Previously scattered across `telegram_session_mappings`, in-memory Maps, and
-- `ActiveSession.state` (latter two = non-persistent). Resume bugs traced to
-- this split (see INVARIANTS.md INV-3 appendix).
--
-- Defaults MUST match @companion/shared constants:
--   SESSION_IDLE_TIMEOUT_MS=1800000, DEFAULT_IDLE_TIMEOUT_ENABLED=true,
--   DEFAULT_KEEP_ALIVE=false, DEFAULT_AUTO_REINJECT_ON_COMPACT=true,
--   DEFAULT_THINKING_MODE='adaptive', DEFAULT_CONTEXT_MODE='200k'
--
-- Phase 2 will move writers/readers onto SessionSettingsService.
-- Phase 3 drops `telegram_session_mappings.idle_timeout_ms` after grace period.
-- Non-idempotent: embedded migration runner tracks by file name.

ALTER TABLE sessions ADD COLUMN idle_timeout_ms INTEGER NOT NULL DEFAULT 1800000;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN idle_timeout_enabled INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN keep_alive INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN auto_reinject_on_compact INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN thinking_mode TEXT NOT NULL DEFAULT 'adaptive';
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN context_mode TEXT NOT NULL DEFAULT '200k';
--> statement-breakpoint
-- Backfill from existing telegram_session_mappings so Telegram users keep
-- whatever timeout they had. Sessions without a mapping keep the new default
-- (30 min — previously the Map fallback; matches SESSION_IDLE_TIMEOUT_MS).
UPDATE sessions SET
  idle_timeout_ms = (
    SELECT m.idle_timeout_ms
    FROM telegram_session_mappings m
    WHERE m.session_id = sessions.id
    LIMIT 1
  ),
  idle_timeout_enabled = (
    SELECT m.idle_timeout_enabled
    FROM telegram_session_mappings m
    WHERE m.session_id = sessions.id
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1 FROM telegram_session_mappings m
  WHERE m.session_id = sessions.id
);
