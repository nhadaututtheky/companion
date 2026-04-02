CREATE TABLE IF NOT EXISTS `session_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `session_id` text NOT NULL REFERENCES `sessions`(`id`),
  `content` text NOT NULL,
  `label` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_snapshots_session` ON `session_snapshots` (`session_id`);
