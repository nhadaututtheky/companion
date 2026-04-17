-- CodeGraph query telemetry log for Phase 0 baseline measurement.
-- Logs every agent query (type, input, result count, tokens saved, latency)
-- to give data-driven evidence for Phase 1/2/3 decisions.
--
-- Rotation: keep max 10K rows per project per day (enforced in app code).
-- Non-idempotent: embedded migration runner tracks by file name.
CREATE TABLE IF NOT EXISTS `code_query_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `project_slug` text NOT NULL,
  `query_type` text NOT NULL,
  `query_text` text,
  `result_count` integer NOT NULL DEFAULT 0,
  `tokens_returned` integer NOT NULL DEFAULT 0,
  `latency_ms` integer NOT NULL DEFAULT 0,
  `agent_source` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cql_slug_created` ON `code_query_log` (`project_slug`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cql_query_type` ON `code_query_log` (`project_slug`, `query_type`);
