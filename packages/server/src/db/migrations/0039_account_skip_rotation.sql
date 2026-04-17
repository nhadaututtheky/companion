-- Per-account "skip in rotation" flag: when true, the auto-switch system
-- will not pick this account as the next target. Still usable manually.
-- Non-idempotent: embedded migration runner tracks by file name.
ALTER TABLE accounts ADD COLUMN skip_in_rotation INTEGER NOT NULL DEFAULT 0;
