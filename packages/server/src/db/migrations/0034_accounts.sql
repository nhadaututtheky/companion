CREATE TABLE IF NOT EXISTS `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `label` text NOT NULL,
  `fingerprint` text NOT NULL,
  `encrypted_credentials` text NOT NULL,
  `subscription_type` text,
  `rate_limit_tier` text,
  `is_active` integer DEFAULT false NOT NULL,
  `status` text DEFAULT 'ready' NOT NULL,
  `status_until` integer,
  `total_cost_usd` real DEFAULT 0 NOT NULL,
  `last_used_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `accounts_fingerprint_unique` ON `accounts` (`fingerprint`);
