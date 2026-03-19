-- Performance indexes
CREATE INDEX IF NOT EXISTS `idx_session_messages_session_id` ON `session_messages` (`session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_project_slug` ON `sessions` (`project_slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_started_at` ON `sessions` (`started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_status` ON `sessions` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_telegram_session_mappings_chat_id` ON `telegram_session_mappings` (`chat_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_channel_messages_channel_id` ON `channel_messages` (`channel_id`);
