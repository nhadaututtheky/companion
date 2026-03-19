CREATE TABLE `channel_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`project_slug` text,
	`type` text DEFAULT 'debate' NOT NULL,
	`topic` text NOT NULL,
	`format` text,
	`status` text DEFAULT 'active' NOT NULL,
	`max_rounds` integer DEFAULT 5 NOT NULL,
	`current_round` integer DEFAULT 0 NOT NULL,
	`verdict` text,
	`created_at` integer NOT NULL,
	`concluded_at` integer,
	FOREIGN KEY (`project_slug`) REFERENCES `projects`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daily_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`project_slug` text,
	`total_cost_usd` real DEFAULT 0 NOT NULL,
	`total_sessions` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`dir` text NOT NULL,
	`default_model` text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	`permission_mode` text DEFAULT 'default' NOT NULL,
	`env_vars` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`source` text DEFAULT 'api' NOT NULL,
	`source_id` text,
	`agent_role` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`summary` text NOT NULL,
	`key_decisions` text,
	`files_modified` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_slug` text,
	`model` text NOT NULL,
	`status` text DEFAULT 'starting' NOT NULL,
	`cwd` text NOT NULL,
	`pid` integer,
	`permission_mode` text DEFAULT 'default' NOT NULL,
	`claude_code_version` text,
	`cli_session_id` text,
	`source` text DEFAULT 'api' NOT NULL,
	`parent_id` text,
	`channel_id` text,
	`total_cost_usd` real DEFAULT 0 NOT NULL,
	`num_turns` integer DEFAULT 0 NOT NULL,
	`total_input_tokens` integer DEFAULT 0 NOT NULL,
	`total_output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`total_lines_added` integer DEFAULT 0 NOT NULL,
	`total_lines_removed` integer DEFAULT 0 NOT NULL,
	`files_read` text DEFAULT '[]',
	`files_modified` text DEFAULT '[]',
	`files_created` text DEFAULT '[]',
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`project_slug`) REFERENCES `projects`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_bots` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`role` text DEFAULT 'claude' NOT NULL,
	`bot_token` text NOT NULL,
	`allowed_chat_ids` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`notification_group_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_session_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`session_id` text NOT NULL,
	`project_slug` text NOT NULL,
	`model` text NOT NULL,
	`topic_id` integer,
	`pinned_message_id` integer,
	`idle_timeout_enabled` integer DEFAULT true NOT NULL,
	`idle_timeout_ms` integer DEFAULT 3600000 NOT NULL,
	`cli_session_id` text,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
