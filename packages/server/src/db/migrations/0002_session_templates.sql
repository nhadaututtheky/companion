CREATE TABLE IF NOT EXISTS `session_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `project_slug` text REFERENCES `projects`(`slug`),
  `prompt` text NOT NULL,
  `model` text,
  `permission_mode` text,
  `icon` text NOT NULL DEFAULT '⚡',
  `sort_order` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `session_templates_slug_unique` ON `session_templates` (`slug`);
