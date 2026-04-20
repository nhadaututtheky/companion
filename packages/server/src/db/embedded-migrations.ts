// Auto-generated embedded migrations -- do not edit manually.

export const EMBEDDED_MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "0000_uneven_hulk.sql",
    sql: "CREATE TABLE `channel_messages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`channel_id` text NOT NULL,\n\t`agent_id` text NOT NULL,\n\t`role` text NOT NULL,\n\t`content` text NOT NULL,\n\t`round` integer DEFAULT 0 NOT NULL,\n\t`timestamp` integer NOT NULL,\n\tFOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action\n);\n--> statement-breakpoint\nCREATE TABLE `channels` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`project_slug` text,\n\t`type` text DEFAULT 'debate' NOT NULL,\n\t`topic` text NOT NULL,\n\t`format` text,\n\t`status` text DEFAULT 'active' NOT NULL,\n\t`max_rounds` integer DEFAULT 5 NOT NULL,\n\t`current_round` integer DEFAULT 0 NOT NULL,\n\t`verdict` text,\n\t`created_at` integer NOT NULL,\n\t`concluded_at` integer,\n\tFOREIGN KEY (`project_slug`) REFERENCES `projects`(`slug`) ON UPDATE no action ON DELETE no action\n);\n--> statement-breakpoint\nCREATE TABLE `daily_costs` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`date` text NOT NULL,\n\t`project_slug` text,\n\t`total_cost_usd` real DEFAULT 0 NOT NULL,\n\t`total_sessions` integer DEFAULT 0 NOT NULL,\n\t`total_tokens` integer DEFAULT 0 NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `projects` (\n\t`slug` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`dir` text NOT NULL,\n\t`default_model` text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,\n\t`permission_mode` text DEFAULT 'default' NOT NULL,\n\t`env_vars` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `session_messages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`session_id` text NOT NULL,\n\t`role` text NOT NULL,\n\t`content` text NOT NULL,\n\t`source` text DEFAULT 'api' NOT NULL,\n\t`source_id` text,\n\t`agent_role` text,\n\t`timestamp` integer NOT NULL,\n\tFOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action\n);\n--> statement-breakpoint\nCREATE TABLE `session_summaries` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`session_id` text NOT NULL,\n\t`summary` text NOT NULL,\n\t`key_decisions` text,\n\t`files_modified` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action\n);\n--> statement-breakpoint\nCREATE TABLE `sessions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`project_slug` text,\n\t`model` text NOT NULL,\n\t`status` text DEFAULT 'starting' NOT NULL,\n\t`cwd` text NOT NULL,\n\t`pid` integer,\n\t`permission_mode` text DEFAULT 'default' NOT NULL,\n\t`claude_code_version` text,\n\t`cli_session_id` text,\n\t`source` text DEFAULT 'api' NOT NULL,\n\t`parent_id` text,\n\t`channel_id` text,\n\t`total_cost_usd` real DEFAULT 0 NOT NULL,\n\t`num_turns` integer DEFAULT 0 NOT NULL,\n\t`total_input_tokens` integer DEFAULT 0 NOT NULL,\n\t`total_output_tokens` integer DEFAULT 0 NOT NULL,\n\t`cache_creation_tokens` integer DEFAULT 0 NOT NULL,\n\t`cache_read_tokens` integer DEFAULT 0 NOT NULL,\n\t`total_lines_added` integer DEFAULT 0 NOT NULL,\n\t`total_lines_removed` integer DEFAULT 0 NOT NULL,\n\t`files_read` text DEFAULT '[]',\n\t`files_modified` text DEFAULT '[]',\n\t`files_created` text DEFAULT '[]',\n\t`started_at` integer NOT NULL,\n\t`ended_at` integer,\n\tFOREIGN KEY (`project_slug`) REFERENCES `projects`(`slug`) ON UPDATE no action ON DELETE no action\n);\n--> statement-breakpoint\nCREATE TABLE `settings` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL,\n\t`updated_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `telegram_bots` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`label` text NOT NULL,\n\t`role` text DEFAULT 'claude' NOT NULL,\n\t`bot_token` text NOT NULL,\n\t`allowed_chat_ids` text DEFAULT '[]' NOT NULL,\n\t`enabled` integer DEFAULT true NOT NULL,\n\t`notification_group_id` integer,\n\t`created_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `telegram_session_mappings` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n\t`chat_id` integer NOT NULL,\n\t`session_id` text NOT NULL,\n\t`project_slug` text NOT NULL,\n\t`model` text NOT NULL,\n\t`topic_id` integer,\n\t`pinned_message_id` integer,\n\t`idle_timeout_enabled` integer DEFAULT true NOT NULL,\n\t`idle_timeout_ms` integer DEFAULT 3600000 NOT NULL,\n\t`cli_session_id` text,\n\t`created_at` integer NOT NULL,\n\t`last_activity_at` integer NOT NULL,\n\tFOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action\n);\n",
  },
  {
    name: "0001_add_indexes.sql",
    sql: "-- Performance indexes\nCREATE INDEX IF NOT EXISTS `idx_session_messages_session_id` ON `session_messages` (`session_id`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_sessions_project_slug` ON `sessions` (`project_slug`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_sessions_started_at` ON `sessions` (`started_at`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_sessions_status` ON `sessions` (`status`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_telegram_session_mappings_chat_id` ON `telegram_session_mappings` (`chat_id`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_channel_messages_channel_id` ON `channel_messages` (`channel_id`);\n",
  },
  {
    name: "0002_session_templates.sql",
    sql: "CREATE TABLE IF NOT EXISTS `session_templates` (\n  `id` text PRIMARY KEY NOT NULL,\n  `name` text NOT NULL,\n  `slug` text NOT NULL,\n  `project_slug` text REFERENCES `projects`(`slug`),\n  `prompt` text NOT NULL,\n  `model` text,\n  `permission_mode` text,\n  `icon` text NOT NULL DEFAULT '⚡',\n  `sort_order` integer NOT NULL DEFAULT 0,\n  `created_at` integer NOT NULL,\n  `updated_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX IF NOT EXISTS `session_templates_slug_unique` ON `session_templates` (`slug`);\n",
  },
  {
    name: "0003_add_allowed_user_ids.sql",
    sql: "ALTER TABLE `telegram_bots` ADD COLUMN `allowed_user_ids` text DEFAULT '[]' NOT NULL;\n",
  },
  {
    name: "0004_template_variables.sql",
    sql: "ALTER TABLE session_templates ADD COLUMN variables text;\n",
  },
  {
    name: "0005_session_short_ids.sql",
    sql: "-- Add short_id column for @mention system\nALTER TABLE sessions ADD COLUMN short_id TEXT;\n\n-- Unique index for short_id (partial — allows multiple NULLs)\nCREATE UNIQUE INDEX idx_sessions_short_id ON sessions(short_id) WHERE short_id IS NOT NULL;\n",
  },
  {
    name: "0006_session_management.sql",
    sql: "-- Session management: rename, cost budget, compact mode\nALTER TABLE sessions ADD COLUMN name TEXT;\nALTER TABLE sessions ADD COLUMN cost_budget_usd REAL;\nALTER TABLE sessions ADD COLUMN cost_warned INTEGER NOT NULL DEFAULT 0;\nALTER TABLE sessions ADD COLUMN compact_mode TEXT NOT NULL DEFAULT 'manual';\nALTER TABLE sessions ADD COLUMN compact_threshold INTEGER NOT NULL DEFAULT 75;\n",
  },
  {
    name: "0007_session_notes.sql",
    sql: "-- Session notes (persistent, replaces in-memory Map)\nCREATE TABLE IF NOT EXISTS session_notes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  session_id TEXT NOT NULL REFERENCES sessions(id),\n  content TEXT NOT NULL,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n\nCREATE INDEX IF NOT EXISTS idx_session_notes_session ON session_notes(session_id);\n",
  },
  {
    name: "0008_web_intel.sql",
    sql: "CREATE TABLE IF NOT EXISTS web_intel_docs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  library_name TEXT NOT NULL,\n  docs_url TEXT NOT NULL,\n  content_hash TEXT NOT NULL,\n  llm_content TEXT NOT NULL,\n  fetched_at INTEGER NOT NULL,\n  access_count INTEGER NOT NULL DEFAULT 1,\n  last_accessed_at INTEGER NOT NULL\n);\n\nCREATE INDEX idx_webintel_docs_library ON web_intel_docs(library_name);\n",
  },
  {
    name: "0009_session_tags.sql",
    sql: "ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]';\n",
  },
  {
    name: "0010_codegraph.sql",
    sql: "CREATE TABLE IF NOT EXISTS code_files (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  project_slug TEXT NOT NULL,\n  file_path TEXT NOT NULL,\n  file_hash TEXT NOT NULL,\n  total_lines INTEGER NOT NULL DEFAULT 0,\n  language TEXT NOT NULL DEFAULT 'typescript',\n  description TEXT,\n  last_scanned_at INTEGER NOT NULL,\n  scan_version INTEGER NOT NULL DEFAULT 1\n);\n\nCREATE INDEX IF NOT EXISTS idx_code_files_project ON code_files(project_slug);\nCREATE UNIQUE INDEX IF NOT EXISTS idx_code_files_path ON code_files(project_slug, file_path);\n\n--> statement-breakpoint\n\nCREATE TABLE IF NOT EXISTS code_nodes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  project_slug TEXT NOT NULL,\n  file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,\n  file_path TEXT NOT NULL,\n  symbol_name TEXT NOT NULL,\n  symbol_type TEXT NOT NULL,\n  signature TEXT,\n  description TEXT,\n  is_exported INTEGER NOT NULL DEFAULT 0,\n  line_start INTEGER NOT NULL,\n  line_end INTEGER NOT NULL,\n  body_preview TEXT,\n  updated_at INTEGER NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_code_nodes_project ON code_nodes(project_slug);\nCREATE INDEX IF NOT EXISTS idx_code_nodes_file ON code_nodes(file_id);\nCREATE INDEX IF NOT EXISTS idx_code_nodes_symbol ON code_nodes(project_slug, symbol_name);\nCREATE INDEX IF NOT EXISTS idx_code_nodes_type ON code_nodes(project_slug, symbol_type);\n\n--> statement-breakpoint\n\nCREATE TABLE IF NOT EXISTS code_edges (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  project_slug TEXT NOT NULL,\n  source_node_id INTEGER NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,\n  target_node_id INTEGER NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,\n  edge_type TEXT NOT NULL,\n  trust_weight REAL NOT NULL DEFAULT 0.5,\n  context TEXT,\n  updated_at INTEGER NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_code_edges_source ON code_edges(source_node_id);\nCREATE INDEX IF NOT EXISTS idx_code_edges_target ON code_edges(target_node_id);\nCREATE INDEX IF NOT EXISTS idx_code_edges_project ON code_edges(project_slug);\nCREATE INDEX IF NOT EXISTS idx_code_edges_type ON code_edges(project_slug, edge_type);\n\n--> statement-breakpoint\n\nCREATE TABLE IF NOT EXISTS code_scan_jobs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  project_slug TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending',\n  total_files INTEGER NOT NULL DEFAULT 0,\n  scanned_files INTEGER NOT NULL DEFAULT 0,\n  total_nodes INTEGER NOT NULL DEFAULT 0,\n  total_edges INTEGER NOT NULL DEFAULT 0,\n  error_message TEXT,\n  started_at INTEGER NOT NULL,\n  completed_at INTEGER\n);\n",
  },
  {
    name: "0011_add_codegraph_indexes.sql",
    sql: "-- Codegraph + session performance indexes\nCREATE INDEX IF NOT EXISTS `idx_sessions_ended_at` ON `sessions` (`ended_at`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_files_project` ON `code_files` (`project_slug`);\n--> statement-breakpoint\nCREATE UNIQUE INDEX IF NOT EXISTS `idx_code_files_path` ON `code_files` (`project_slug`, `file_path`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_nodes_project` ON `code_nodes` (`project_slug`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_nodes_file` ON `code_nodes` (`file_id`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_nodes_symbol` ON `code_nodes` (`project_slug`, `symbol_name`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_nodes_type` ON `code_nodes` (`project_slug`, `symbol_type`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_edges_source` ON `code_edges` (`source_node_id`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_edges_target` ON `code_edges` (`target_node_id`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_edges_project` ON `code_edges` (`project_slug`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_code_edges_type` ON `code_edges` (`project_slug`, `edge_type`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_webintel_docs_library` ON `web_intel_docs` (`library_name`);\n",
  },
  {
    name: "0012_session_snapshots.sql",
    sql: "CREATE TABLE IF NOT EXISTS `session_snapshots` (\n  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n  `session_id` text NOT NULL REFERENCES `sessions`(`id`),\n  `content` text NOT NULL,\n  `label` text,\n  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000)\n);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_snapshots_session` ON `session_snapshots` (`session_id`);\n",
  },
  {
    name: "0013_share_tokens.sql",
    sql: "-- Share tokens for QR Stream Sharing (Phase 3)\nCREATE TABLE IF NOT EXISTS share_tokens (\n  token TEXT PRIMARY KEY,\n  session_id TEXT NOT NULL REFERENCES sessions(id),\n  permission TEXT NOT NULL DEFAULT 'read-only',\n  created_by TEXT NOT NULL DEFAULT 'owner',\n  expires_at INTEGER NOT NULL,\n  revoked_at INTEGER,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n\nCREATE INDEX IF NOT EXISTS idx_share_tokens_session ON share_tokens(session_id);\nCREATE INDEX IF NOT EXISTS idx_share_tokens_expires ON share_tokens(expires_at);\n",
  },
  {
    name: "0014_error_logs.sql",
    sql: "CREATE TABLE IF NOT EXISTS error_logs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  source TEXT NOT NULL,\n  level TEXT NOT NULL DEFAULT 'error',\n  message TEXT NOT NULL,\n  stack TEXT,\n  session_id TEXT,\n  context TEXT,\n  timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n\nCREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);\nCREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs(source);\nCREATE INDEX IF NOT EXISTS idx_error_logs_session ON error_logs(session_id);\n",
  },
  {
    name: "0015_db_connections.sql",
    sql: "CREATE TABLE IF NOT EXISTS db_connections (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  type TEXT NOT NULL,\n  connection_string TEXT NOT NULL,\n  project_slug TEXT,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n",
  },
  {
    name: "0016_workflow_templates.sql",
    sql: "CREATE TABLE IF NOT EXISTS workflow_templates (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  slug TEXT NOT NULL UNIQUE,\n  description TEXT NOT NULL DEFAULT '',\n  icon TEXT NOT NULL DEFAULT '🔄',\n  category TEXT NOT NULL DEFAULT 'custom',\n  steps TEXT NOT NULL,\n  is_built_in INTEGER NOT NULL DEFAULT 0,\n  default_cost_cap_usd REAL DEFAULT 1.0,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n",
  },
  {
    name: "0017_workflow_channels.sql",
    sql: "ALTER TABLE channels ADD COLUMN workflow_template_id TEXT;\nALTER TABLE channels ADD COLUMN workflow_state TEXT;\n",
  },
  {
    name: "0018_codegraph_config.sql",
    sql: "CREATE TABLE IF NOT EXISTS codegraph_config (\n  project_slug TEXT PRIMARY KEY,\n  injection_enabled INTEGER NOT NULL DEFAULT 1,\n  project_map_enabled INTEGER NOT NULL DEFAULT 1,\n  message_context_enabled INTEGER NOT NULL DEFAULT 1,\n  plan_review_enabled INTEGER NOT NULL DEFAULT 1,\n  break_check_enabled INTEGER NOT NULL DEFAULT 1,\n  web_docs_enabled INTEGER NOT NULL DEFAULT 1,\n  exclude_patterns TEXT NOT NULL DEFAULT '[]',\n  max_context_tokens INTEGER NOT NULL DEFAULT 800,\n  updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n);\n",
  },
  {
    name: "0019_schedules.sql",
    sql: "-- Schedules table for scheduled/recurring sessions\nCREATE TABLE IF NOT EXISTS `schedules` (\n  `id` text PRIMARY KEY NOT NULL,\n  `name` text NOT NULL,\n  `project_slug` text REFERENCES `projects`(`slug`),\n  `prompt` text,\n  `template_id` text,\n  `template_vars` text DEFAULT '{}',\n  `model` text NOT NULL DEFAULT 'claude-sonnet-4-6',\n  `permission_mode` text NOT NULL DEFAULT 'default',\n  `trigger_type` text NOT NULL DEFAULT 'once',\n  `cron_expression` text,\n  `scheduled_at` integer,\n  `timezone` text NOT NULL DEFAULT 'UTC',\n  `telegram_target` text DEFAULT '{\"mode\":\"off\"}',\n  `auto_stop_rules` text DEFAULT '{}',\n  `enabled` integer NOT NULL DEFAULT 1,\n  `last_run_at` integer,\n  `next_run_at` integer,\n  `run_count` integer NOT NULL DEFAULT 0,\n  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),\n  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000)\n);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_schedules_enabled_next` ON `schedules` (`enabled`, `next_run_at`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_schedules_project` ON `schedules` (`project_slug`);\n--> statement-breakpoint\n-- Add telegramTarget column to sessions table\nALTER TABLE `sessions` ADD COLUMN `telegram_target` text;\n",
  },
  {
    name: "0020_schedule_runs.sql",
    sql: "-- Schedule runs audit trail\nCREATE TABLE IF NOT EXISTS `schedule_runs` (\n  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n  `schedule_id` text NOT NULL REFERENCES `schedules`(`id`) ON DELETE CASCADE,\n  `session_id` text,\n  `status` text NOT NULL,\n  `reason` text,\n  `started_at` integer NOT NULL DEFAULT (unixepoch() * 1000)\n);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_schedule_runs_schedule` ON `schedule_runs` (`schedule_id`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_schedule_runs_started_at` ON `schedule_runs` (`started_at`);\n",
  },
  {
    name: "0021_forum_topics.sql",
    sql: "CREATE TABLE IF NOT EXISTS telegram_forum_topics (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  chat_id INTEGER NOT NULL,\n  project_slug TEXT NOT NULL REFERENCES projects(slug),\n  topic_id INTEGER NOT NULL,\n  topic_name TEXT NOT NULL,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n\nCREATE UNIQUE INDEX IF NOT EXISTS idx_forum_chat_project ON telegram_forum_topics(chat_id, project_slug);\nCREATE INDEX IF NOT EXISTS idx_forum_chat ON telegram_forum_topics(chat_id);\n",
  },
  {
    name: "0022_add_performance_indexes.sql",
    sql: "-- Composite index for ordered message queries by session\nCREATE INDEX IF NOT EXISTS idx_session_messages_session_ts ON session_messages(session_id, timestamp);\n--> statement-breakpoint\n-- Composite index for daily cost lookups by date + project\nCREATE UNIQUE INDEX IF NOT EXISTS idx_daily_costs_date_project ON daily_costs(date, project_slug);\n--> statement-breakpoint\n-- Composite index for telegram mapping lookups by chat + project\nCREATE INDEX IF NOT EXISTS idx_telegram_mappings_chat_project ON telegram_session_mappings(chat_id, project_slug);\n--> statement-breakpoint\n-- Index for session status + ended_at (resumable session queries)\nCREATE INDEX IF NOT EXISTS idx_sessions_status_ended ON sessions(status, ended_at);\n",
  },
  {
    name: "0023_saved_prompts.sql",
    sql: "-- Saved prompts: reusable prompt templates (global or project-scoped)\nCREATE TABLE IF NOT EXISTS saved_prompts (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  content TEXT NOT NULL,\n  project_slug TEXT,\n  tags TEXT DEFAULT '[]',\n  sort_order INTEGER DEFAULT 0,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n\nCREATE INDEX IF NOT EXISTS idx_saved_prompts_project ON saved_prompts(project_slug);\n",
  },
  {
    name: "0024_add_persona_id.sql",
    sql: "ALTER TABLE sessions ADD COLUMN persona_id TEXT;\n",
  },
  {
    name: "0025_channel_message_persona_id.sql",
    sql: "ALTER TABLE channel_messages ADD COLUMN persona_id TEXT;\n",
  },
  {
    name: "0026_custom_personas.sql",
    sql: "CREATE TABLE IF NOT EXISTS custom_personas (\n  id TEXT PRIMARY KEY NOT NULL,\n  name TEXT NOT NULL,\n  slug TEXT NOT NULL,\n  icon TEXT NOT NULL DEFAULT '🧠',\n  title TEXT NOT NULL,\n  intro TEXT NOT NULL DEFAULT '',\n  system_prompt TEXT NOT NULL,\n  mental_models TEXT NOT NULL DEFAULT '[]',\n  decision_framework TEXT NOT NULL DEFAULT '',\n  red_flags TEXT NOT NULL DEFAULT '[]',\n  communication_style TEXT NOT NULL DEFAULT '',\n  blind_spots TEXT NOT NULL DEFAULT '[]',\n  best_for TEXT NOT NULL DEFAULT '[]',\n  strength TEXT NOT NULL DEFAULT '',\n  avatar_gradient TEXT NOT NULL DEFAULT '[\"#6366f1\",\"#8b5cf6\"]',\n  avatar_initials TEXT NOT NULL DEFAULT 'CP',\n  combinable_with TEXT,\n  cloned_from TEXT,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),\n  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n\nCREATE INDEX IF NOT EXISTS idx_custom_personas_slug ON custom_personas(slug);\n",
  },
  {
    name: "0027_fts5_search.sql",
    sql: "-- FTS5 full-text search for code_nodes\n-- Porter stemming tokenizer for natural language matching\nCREATE VIRTUAL TABLE IF NOT EXISTS code_nodes_fts USING fts5(\n  symbol_name,\n  description,\n  file_path,\n  body_preview,\n  content='code_nodes',\n  content_rowid='id',\n  tokenize='porter unicode61'\n);\n\n--> statement-breakpoint\n\n-- Auto-sync triggers to keep FTS in sync with code_nodes\nCREATE TRIGGER IF NOT EXISTS code_nodes_fts_insert AFTER INSERT ON code_nodes BEGIN\n  INSERT INTO code_nodes_fts(rowid, symbol_name, description, file_path, body_preview)\n  VALUES (new.id, new.symbol_name, COALESCE(new.description, ''), new.file_path, COALESCE(new.body_preview, ''));\nEND;\n\n--> statement-breakpoint\n\nCREATE TRIGGER IF NOT EXISTS code_nodes_fts_delete AFTER DELETE ON code_nodes BEGIN\n  INSERT INTO code_nodes_fts(code_nodes_fts, rowid, symbol_name, description, file_path, body_preview)\n  VALUES ('delete', old.id, old.symbol_name, COALESCE(old.description, ''), old.file_path, COALESCE(old.body_preview, ''));\nEND;\n\n--> statement-breakpoint\n\nCREATE TRIGGER IF NOT EXISTS code_nodes_fts_update AFTER UPDATE ON code_nodes BEGIN\n  INSERT INTO code_nodes_fts(code_nodes_fts, rowid, symbol_name, description, file_path, body_preview)\n  VALUES ('delete', old.id, old.symbol_name, COALESCE(old.description, ''), old.file_path, COALESCE(old.body_preview, ''));\n  INSERT INTO code_nodes_fts(rowid, symbol_name, description, file_path, body_preview)\n  VALUES (new.id, new.symbol_name, COALESCE(new.description, ''), new.file_path, COALESCE(new.body_preview, ''));\nEND;\n",
  },
  {
    name: "0028_cli_platform.sql",
    sql: "-- Add CLI platform tracking to sessions\n-- Supports multi-CLI: claude, codex, gemini, opencode\nALTER TABLE sessions ADD COLUMN cli_platform TEXT DEFAULT 'claude';\n",
  },
  {
    name: "0029_session_role.sql",
    sql: "-- Add agent role for multi-brain workspace\n-- Values: coordinator, specialist, researcher, reviewer\nALTER TABLE sessions ADD COLUMN role TEXT;\n",
  },
  {
    name: "0030_session_insights.sql",
    sql: "-- Session Insights — cross-session learning from patterns, mistakes, preferences\nCREATE TABLE IF NOT EXISTS session_insights (\n  id TEXT PRIMARY KEY,\n  project_slug TEXT NOT NULL DEFAULT '',\n  type TEXT NOT NULL CHECK (type IN ('pattern', 'mistake', 'preference', 'hotspot')),\n  content TEXT NOT NULL,\n  source_session_id TEXT NOT NULL DEFAULT '',\n  source_files TEXT NOT NULL DEFAULT '[]',\n  relevance_score REAL NOT NULL DEFAULT 0.5,\n  hit_count INTEGER NOT NULL DEFAULT 1,\n  content_hash TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT (datetime('now')),\n  last_used_at TEXT NOT NULL DEFAULT (datetime('now'))\n);\n\nCREATE INDEX IF NOT EXISTS idx_insights_project ON session_insights(project_slug);\nCREATE INDEX IF NOT EXISTS idx_insights_type ON session_insights(type);\nCREATE INDEX IF NOT EXISTS idx_insights_hash ON session_insights(content_hash);\n",
  },
  {
    name: "0031_workspaces.sql",
    sql: "-- Workspaces: multi-CLI project hub\nCREATE TABLE `workspaces` (\n  `id` text PRIMARY KEY NOT NULL,\n  `name` text NOT NULL,\n  `project_slug` text NOT NULL REFERENCES `projects`(`slug`),\n  `cli_slots` text NOT NULL DEFAULT '[\"claude\"]',\n  `default_expert` text,\n  `auto_connect` integer NOT NULL DEFAULT 0,\n  `wiki_domain` text,\n  `created_at` integer NOT NULL,\n  `updated_at` integer NOT NULL\n);\n-->statement-breakpoint\nCREATE INDEX `idx_workspaces_project` ON `workspaces` (`project_slug`);\n-->statement-breakpoint\n-- Link sessions to workspace\nALTER TABLE `sessions` ADD COLUMN `workspace_id` text REFERENCES `workspaces`(`id`);\n-->statement-breakpoint\nCREATE INDEX `idx_sessions_workspace` ON `sessions` (`workspace_id`);\n",
  },
  {
    name: "0032_rtk_columns.sql",
    sql: "ALTER TABLE sessions ADD COLUMN rtk_tokens_saved INTEGER NOT NULL DEFAULT 0;\nALTER TABLE sessions ADD COLUMN rtk_compressions INTEGER NOT NULL DEFAULT 0;\nALTER TABLE sessions ADD COLUMN rtk_cache_hits INTEGER NOT NULL DEFAULT 0;\n",
  },
  {
    name: "0033_context_injection_log.sql",
    sql: "CREATE TABLE IF NOT EXISTS context_injection_log (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  session_id TEXT NOT NULL,\n  project_slug TEXT NOT NULL DEFAULT '',\n  injection_type TEXT NOT NULL,\n  token_count INTEGER NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)\n);\n\nCREATE INDEX IF NOT EXISTS idx_ctx_injection_session ON context_injection_log(session_id);\nCREATE INDEX IF NOT EXISTS idx_ctx_injection_type ON context_injection_log(injection_type);\nCREATE INDEX IF NOT EXISTS idx_ctx_injection_created ON context_injection_log(created_at);\n",
  },
  {
    name: "0034_accounts.sql",
    sql: "CREATE TABLE IF NOT EXISTS `accounts` (\n  `id` text PRIMARY KEY NOT NULL,\n  `label` text NOT NULL,\n  `fingerprint` text NOT NULL,\n  `encrypted_credentials` text NOT NULL,\n  `subscription_type` text,\n  `rate_limit_tier` text,\n  `is_active` integer DEFAULT false NOT NULL,\n  `status` text DEFAULT 'ready' NOT NULL,\n  `status_until` integer,\n  `total_cost_usd` real DEFAULT 0 NOT NULL,\n  `last_used_at` integer,\n  `created_at` integer NOT NULL,\n  `updated_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX IF NOT EXISTS `accounts_fingerprint_unique` ON `accounts` (`fingerprint`);\n",
  },
  {
    name: "0035_session_account.sql",
    sql: "-- Track which account was used for each session (multi-account management)\nALTER TABLE sessions ADD COLUMN account_id TEXT;\n",
  },
  {
    name: "0036_codegraph_auto_reindex.sql",
    sql: "-- Auto-reindex toggle for codegraph (Phase 4: auto-reindex on file changes)\nALTER TABLE codegraph_config ADD COLUMN auto_reindex_enabled INTEGER NOT NULL DEFAULT 1;\n",
  },
  {
    name: "0037_account_usage_index.sql",
    sql: "-- Composite index for per-account usage queries (rolling windows, heatmap, model breakdown)\nCREATE INDEX IF NOT EXISTS idx_sessions_account_started ON sessions(account_id, started_at);\n",
  },
  {
    name: "0038_account_budgets.sql",
    sql: "-- Per-account custom budget limits (null = fall back to client defaults).\n-- Non-idempotent: SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS guard.\n-- Safe because the embedded migration runner tracks applied migrations by file name.\nALTER TABLE accounts ADD COLUMN session_5h_budget REAL;\n--> statement-breakpoint\nALTER TABLE accounts ADD COLUMN weekly_budget REAL;\n--> statement-breakpoint\nALTER TABLE accounts ADD COLUMN monthly_budget REAL;\n",
  },
  {
    name: "0039_account_skip_rotation.sql",
    sql: "-- Per-account \"skip in rotation\" flag: when true, the auto-switch system\n-- will not pick this account as the next target. Still usable manually.\n-- Non-idempotent: embedded migration runner tracks by file name.\nALTER TABLE accounts ADD COLUMN skip_in_rotation INTEGER NOT NULL DEFAULT 0;\n",
  },
  {
    name: "0040_account_identity.sql",
    sql: "-- Multi Account dedup bug fix: stable identity column.\n--\n-- Problem: fingerprint = sha256(accessToken)[:16] rotates every ~1h when\n-- Claude OAuth refreshes the access token. Each refresh inserts a NEW row\n-- because the fingerprint is different, accumulating ghost accounts.\n--\n-- Fix: add `identity` column = sha256(refreshToken)[:16]. Refresh tokens\n-- stay stable across access-token refreshes (rotate only on re-authorization).\n-- Upsert by identity instead of fingerprint.\n--\n-- Backfill + dedupe runs in app code on startup (see credential-manager.ts:\n-- dedupeAccountsByIdentity()). This migration only adds the column.\n--\n-- Non-idempotent: embedded migration runner tracks by file name.\nALTER TABLE accounts ADD COLUMN identity TEXT;\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS idx_accounts_identity ON accounts(identity);\n",
  },
  {
    name: "0041_codegraph_telemetry.sql",
    sql: "-- CodeGraph query telemetry log for Phase 0 baseline measurement.\n-- Logs every agent query (type, input, result count, tokens saved, latency)\n-- to give data-driven evidence for Phase 1/2/3 decisions.\n--\n-- Rotation: keep max 10K rows per project per day (enforced in app code).\n-- Non-idempotent: embedded migration runner tracks by file name.\nCREATE TABLE IF NOT EXISTS `code_query_log` (\n  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,\n  `project_slug` text NOT NULL,\n  `query_type` text NOT NULL,\n  `query_text` text,\n  `result_count` integer NOT NULL DEFAULT 0,\n  `tokens_returned` integer NOT NULL DEFAULT 0,\n  `latency_ms` integer NOT NULL DEFAULT 0,\n  `agent_source` text,\n  `created_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_cql_slug_created` ON `code_query_log` (`project_slug`, `created_at`);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS `idx_cql_query_type` ON `code_query_log` (`project_slug`, `query_type`);\n",
  },
  {
    name: "0042_account_oauth_profile.sql",
    sql: "-- Multi Account dedup phase 1: persist OAuth profile fields.\n--\n-- Problem: identity = sha256(refreshToken)[:16] still creates duplicates\n-- when Anthropic issues a fresh refresh token on each `claude login`. The\n-- only stable canonical ID for an account is `account.uuid` returned by\n-- GET https://api.anthropic.com/api/oauth/profile.\n--\n-- This migration adds columns to persist the profile response. A follow-up\n-- service (profile-fetcher.ts) populates them async after credentials are\n-- captured. Phase 2 will switch saveAccount() to upsert by oauth_subject.\n--\n-- Non-idempotent: embedded migration runner tracks by file name.\nALTER TABLE accounts ADD COLUMN oauth_subject TEXT;\n--> statement-breakpoint\nALTER TABLE accounts ADD COLUMN email TEXT;\n--> statement-breakpoint\nALTER TABLE accounts ADD COLUMN display_name TEXT;\n--> statement-breakpoint\nALTER TABLE accounts ADD COLUMN organization_uuid TEXT;\n--> statement-breakpoint\nALTER TABLE accounts ADD COLUMN organization_name TEXT;\n--> statement-breakpoint\nALTER TABLE accounts ADD COLUMN profile_fetched_at INTEGER;\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS idx_accounts_oauth_subject ON accounts(oauth_subject);\n",
  },
  {
    name: "0043_account_merge_events.sql",
    sql: "-- Phase 3: Multi Account dedup conflict-resolution events.\n--\n-- When `mergeAccountsBySubject` collapses duplicate rows that owned different\n-- non-null budget caps, we silently keep the maximum (safer than raising a cap\n-- to null). This table records the original budgets so the user can review and\n-- override the merge result via a banner in the Accounts Manager UI.\n--\n-- One row per merge event. `resolved_at` is set when the user acts on it\n-- (either accepts the auto-pick or applies a different choice).\nCREATE TABLE IF NOT EXISTS account_merge_events (\n  id TEXT PRIMARY KEY,\n  -- Survivor account that absorbed the duplicates. Cascade-delete with the\n  -- account so a user nuking the survivor doesn't leave orphan banners.\n  survivor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,\n  -- Anthropic canonical subject (account.uuid) the event was keyed on. Logged\n  -- for support/debugging — no UI surface.\n  oauth_subject TEXT NOT NULL,\n  -- JSON snapshot: array of { id, label, session5hBudget, weeklyBudget,\n  -- monthlyBudget, totalCostUsd } for every row in the merge group BEFORE the\n  -- merge ran. Lets the UI render a per-row dropdown without needing the\n  -- (now deleted) duplicate rows.\n  before_state TEXT NOT NULL,\n  -- Effective budgets the survivor was left with after the merge. Mirrors\n  -- accounts.* columns at merge-time so the banner can show \"we picked $X\".\n  applied_session5h_budget REAL,\n  applied_weekly_budget REAL,\n  applied_monthly_budget REAL,\n  merged_at INTEGER NOT NULL,\n  -- NULL until user dismisses or applies a budget choice. Once set, banner\n  -- hides this event.\n  resolved_at INTEGER,\n  -- Optional audit: which choice the user picked. \"kept\" = accepted auto-max,\n  -- \"applied:<accountId>\" = picked one of the original rows' budgets.\n  resolved_choice TEXT\n);\n\nCREATE INDEX IF NOT EXISTS idx_account_merge_events_pending\n  ON account_merge_events(survivor_account_id)\n  WHERE resolved_at IS NULL;\n",
  },
  {
    name: "0044_session_settings_unify.sql",
    sql: "-- Session settings unification — Phase 1.\n-- Lift all per-session tuning knobs to `sessions` as the single source of truth.\n-- Previously scattered across `telegram_session_mappings`, in-memory Maps, and\n-- `ActiveSession.state` (latter two = non-persistent). Resume bugs traced to\n-- this split (see INVARIANTS.md INV-3 appendix).\n--\n-- Defaults MUST match @companion/shared constants:\n--   SESSION_IDLE_TIMEOUT_MS=1800000, DEFAULT_IDLE_TIMEOUT_ENABLED=true,\n--   DEFAULT_KEEP_ALIVE=false, DEFAULT_AUTO_REINJECT_ON_COMPACT=true,\n--   DEFAULT_THINKING_MODE='adaptive', DEFAULT_CONTEXT_MODE='200k'\n--\n-- Phase 2 will move writers/readers onto SessionSettingsService.\n-- Phase 3 drops `telegram_session_mappings.idle_timeout_ms` after grace period.\n-- Non-idempotent: embedded migration runner tracks by file name.\n\nALTER TABLE sessions ADD COLUMN idle_timeout_ms INTEGER NOT NULL DEFAULT 1800000;\n--> statement-breakpoint\nALTER TABLE sessions ADD COLUMN idle_timeout_enabled INTEGER NOT NULL DEFAULT 1;\n--> statement-breakpoint\nALTER TABLE sessions ADD COLUMN keep_alive INTEGER NOT NULL DEFAULT 0;\n--> statement-breakpoint\nALTER TABLE sessions ADD COLUMN auto_reinject_on_compact INTEGER NOT NULL DEFAULT 1;\n--> statement-breakpoint\nALTER TABLE sessions ADD COLUMN thinking_mode TEXT NOT NULL DEFAULT 'adaptive';\n--> statement-breakpoint\nALTER TABLE sessions ADD COLUMN context_mode TEXT NOT NULL DEFAULT '200k';\n--> statement-breakpoint\n-- Backfill from existing telegram_session_mappings so Telegram users keep\n-- whatever timeout they had. Sessions without a mapping keep the new default\n-- (30 min — previously the Map fallback; matches SESSION_IDLE_TIMEOUT_MS).\nUPDATE sessions SET\n  idle_timeout_ms = (\n    SELECT m.idle_timeout_ms\n    FROM telegram_session_mappings m\n    WHERE m.session_id = sessions.id\n    LIMIT 1\n  ),\n  idle_timeout_enabled = (\n    SELECT m.idle_timeout_enabled\n    FROM telegram_session_mappings m\n    WHERE m.session_id = sessions.id\n    LIMIT 1\n  )\nWHERE EXISTS (\n  SELECT 1 FROM telegram_session_mappings m\n  WHERE m.session_id = sessions.id\n);\n",
  },
  {
    name: "0045_drop_telegram_idle_columns.sql",
    sql: "-- Session settings unification — Phase 3 cleanup.\n-- Migration 0044 added idle_timeout_ms / idle_timeout_enabled to `sessions`\n-- and backfilled values from `telegram_session_mappings`. Phase 2/3 code\n-- reads + writes those settings exclusively through SessionSettingsService,\n-- which targets the `sessions` row. The mapping-table columns have been\n-- dead since Phase 2 landed; this migration completes the cleanup.\n--\n-- Safety: grep audit (scripts/check-settings-consistency.ts) blocks any\n-- code from writing to these columns. The only remaining reader was the\n-- bootstrap path in telegram-persistence.ts, updated to use the service\n-- in the same commit as this migration.\n--\n-- Rollback: re-create columns + re-run backfill from `sessions`. SQLite\n-- does support DROP COLUMN from v3.35 (2021), so forward migration is\n-- native; down migration would need an explicit ADD COLUMN.\n-- Non-idempotent: embedded migration runner tracks by file name.\n\nALTER TABLE telegram_session_mappings DROP COLUMN idle_timeout_ms;\n--> statement-breakpoint\nALTER TABLE telegram_session_mappings DROP COLUMN idle_timeout_enabled;\n",
  },
];
