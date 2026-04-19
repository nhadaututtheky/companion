-- Multi Account dedup phase 1: persist OAuth profile fields.
--
-- Problem: identity = sha256(refreshToken)[:16] still creates duplicates
-- when Anthropic issues a fresh refresh token on each `claude login`. The
-- only stable canonical ID for an account is `account.uuid` returned by
-- GET https://api.anthropic.com/api/oauth/profile.
--
-- This migration adds columns to persist the profile response. A follow-up
-- service (profile-fetcher.ts) populates them async after credentials are
-- captured. Phase 2 will switch saveAccount() to upsert by oauth_subject.
--
-- Non-idempotent: embedded migration runner tracks by file name.
ALTER TABLE accounts ADD COLUMN oauth_subject TEXT;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN email TEXT;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN display_name TEXT;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN organization_uuid TEXT;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN organization_name TEXT;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN profile_fetched_at INTEGER;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_accounts_oauth_subject ON accounts(oauth_subject);
