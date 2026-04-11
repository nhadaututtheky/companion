-- Workspaces: multi-CLI project hub
CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `project_slug` text NOT NULL REFERENCES `projects`(`slug`),
  `cli_slots` text NOT NULL DEFAULT '["claude"]',
  `default_expert` text,
  `auto_connect` integer NOT NULL DEFAULT 0,
  `wiki_domain` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
-->statement-breakpoint
CREATE INDEX `idx_workspaces_project` ON `workspaces` (`project_slug`);
-->statement-breakpoint
-- Link sessions to workspace
ALTER TABLE `sessions` ADD COLUMN `workspace_id` text REFERENCES `workspaces`(`id`);
-->statement-breakpoint
CREATE INDEX `idx_sessions_workspace` ON `sessions` (`workspace_id`);
