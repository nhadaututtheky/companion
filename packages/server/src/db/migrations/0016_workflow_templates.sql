CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🔄',
  category TEXT NOT NULL DEFAULT 'custom',
  steps TEXT NOT NULL,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  default_cost_cap_usd REAL DEFAULT 1.0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
