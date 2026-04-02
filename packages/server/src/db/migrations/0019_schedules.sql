-- Schedules table for scheduled/recurring sessions
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `project_slug` text REFERENCES `projects`(`slug`),
  `prompt` text,
  `template_id` text,
  `template_vars` text DEFAULT '{}',
  `model` text NOT NULL DEFAULT 'claude-sonnet-4-6',
  `permission_mode` text NOT NULL DEFAULT 'default',
  `trigger_type` text NOT NULL DEFAULT 'once',
  `cron_expression` text,
  `scheduled_at` integer,
  `timezone` text NOT NULL DEFAULT 'UTC',
  `telegram_target` text DEFAULT '{"mode":"off"}',
  `auto_stop_rules` text DEFAULT '{}',
  `enabled` integer NOT NULL DEFAULT 1,
  `last_run_at` integer,
  `next_run_at` integer,
  `run_count` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedules_enabled_next` ON `schedules` (`enabled`, `next_run_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedules_project` ON `schedules` (`project_slug`);
--> statement-breakpoint
-- Add telegramTarget column to sessions table
ALTER TABLE `sessions` ADD COLUMN `telegram_target` text;
