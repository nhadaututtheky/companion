CREATE TABLE IF NOT EXISTS code_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  total_lines INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'typescript',
  description TEXT,
  last_scanned_at INTEGER NOT NULL,
  scan_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_code_files_project ON code_files(project_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_files_path ON code_files(project_slug, file_path);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS code_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL,
  file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL,
  signature TEXT,
  description TEXT,
  is_exported INTEGER NOT NULL DEFAULT 0,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  body_preview TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_code_nodes_project ON code_nodes(project_slug);
CREATE INDEX IF NOT EXISTS idx_code_nodes_file ON code_nodes(file_id);
CREATE INDEX IF NOT EXISTS idx_code_nodes_symbol ON code_nodes(project_slug, symbol_name);
CREATE INDEX IF NOT EXISTS idx_code_nodes_type ON code_nodes(project_slug, symbol_type);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS code_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL,
  source_node_id INTEGER NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,
  trust_weight REAL NOT NULL DEFAULT 0.5,
  context TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_code_edges_source ON code_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_code_edges_target ON code_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_code_edges_project ON code_edges(project_slug);
CREATE INDEX IF NOT EXISTS idx_code_edges_type ON code_edges(project_slug, edge_type);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS code_scan_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_files INTEGER NOT NULL DEFAULT 0,
  scanned_files INTEGER NOT NULL DEFAULT 0,
  total_nodes INTEGER NOT NULL DEFAULT 0,
  total_edges INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
