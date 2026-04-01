-- Codegraph + session performance indexes
CREATE INDEX IF NOT EXISTS `idx_sessions_ended_at` ON `sessions` (`ended_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_files_project` ON `code_files` (`project_slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_code_files_path` ON `code_files` (`project_slug`, `file_path`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_nodes_project` ON `code_nodes` (`project_slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_nodes_file` ON `code_nodes` (`file_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_nodes_symbol` ON `code_nodes` (`project_slug`, `symbol_name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_nodes_type` ON `code_nodes` (`project_slug`, `symbol_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_edges_source` ON `code_edges` (`source_node_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_edges_target` ON `code_edges` (`target_node_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_edges_project` ON `code_edges` (`project_slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_code_edges_type` ON `code_edges` (`project_slug`, `edge_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_webintel_docs_library` ON `web_intel_docs` (`library_name`);
