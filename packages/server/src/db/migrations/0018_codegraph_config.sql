CREATE TABLE IF NOT EXISTS codegraph_config (
  project_slug TEXT PRIMARY KEY,
  injection_enabled INTEGER NOT NULL DEFAULT 1,
  project_map_enabled INTEGER NOT NULL DEFAULT 1,
  message_context_enabled INTEGER NOT NULL DEFAULT 1,
  plan_review_enabled INTEGER NOT NULL DEFAULT 1,
  break_check_enabled INTEGER NOT NULL DEFAULT 1,
  web_docs_enabled INTEGER NOT NULL DEFAULT 1,
  exclude_patterns TEXT NOT NULL DEFAULT '[]',
  max_context_tokens INTEGER NOT NULL DEFAULT 800,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
