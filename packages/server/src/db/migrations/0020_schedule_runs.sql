-- Schedule runs audit trail
CREATE TABLE IF NOT EXISTS `schedule_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `schedule_id` text NOT NULL REFERENCES `schedules`(`id`) ON DELETE CASCADE,
  `session_id` text,
  `status` text NOT NULL,
  `reason` text,
  `started_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_runs_schedule` ON `schedule_runs` (`schedule_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_runs_started_at` ON `schedule_runs` (`started_at`);
