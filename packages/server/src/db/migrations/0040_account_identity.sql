-- Multi Account dedup bug fix: stable identity column.
--
-- Problem: fingerprint = sha256(accessToken)[:16] rotates every ~1h when
-- Claude OAuth refreshes the access token. Each refresh inserts a NEW row
-- because the fingerprint is different, accumulating ghost accounts.
--
-- Fix: add `identity` column = sha256(refreshToken)[:16]. Refresh tokens
-- stay stable across access-token refreshes (rotate only on re-authorization).
-- Upsert by identity instead of fingerprint.
--
-- Backfill + dedupe runs in app code on startup (see credential-manager.ts:
-- dedupeAccountsByIdentity()). This migration only adds the column.
--
-- Non-idempotent: embedded migration runner tracks by file name.
ALTER TABLE accounts ADD COLUMN identity TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_accounts_identity ON accounts(identity);
