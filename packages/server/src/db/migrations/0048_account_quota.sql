-- Per-account Anthropic quota tracking (GET /api/oauth/usage).
--
-- Why: the existing AccountUsagePanel + credential-manager.findNextReady both
-- derive 5h/weekly windows from local `sessions` — which is wrong whenever the
-- same Anthropic account runs outside Companion (other machine, direct CLI,
-- another install). Round-robin currently picks accounts that are at ~99%
-- quota, the request fails with `rate_limit`, and only THEN we swap. With
-- this column set, Phase 2 can gate on the real number BEFORE dispatching.
--
-- Shape: columns mirror the /api/oauth/usage response. All windows are
-- optional — Pro/Max accounts return `five_hour` + `seven_day`, while
-- Team/Enterprise return `five_hour` + `seven_day_opus` + `seven_day_sonnet`.
-- `*_resets_at` is stored in unix ms (Anthropic returns seconds; writer must
-- multiply by 1000) so every timestamp column in `accounts` is the same unit.
-- `quota_overage_status` is a nullable enum text: 'allowed' | 'allowed_warning'
-- | 'rejected'. `quota_fetched_at` doubles as staleness gate — Phase 2 falls
-- back to the regex-based reactive path if this is null or > 5 min old.
--
-- All columns nullable: additive migration, no backfill, no breaking change
-- to existing callers.

ALTER TABLE accounts ADD COLUMN quota_five_hour_util REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_five_hour_resets_at INTEGER;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_seven_day_util REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_seven_day_resets_at INTEGER;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_seven_day_opus_util REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_seven_day_opus_resets_at INTEGER;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_seven_day_sonnet_util REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_seven_day_sonnet_resets_at INTEGER;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_overage_status TEXT;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN quota_fetched_at INTEGER;
