-- Saved prompts: reusable prompt templates (global or project-scoped)
CREATE TABLE IF NOT EXISTS saved_prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  project_slug TEXT,
  tags TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_saved_prompts_project ON saved_prompts(project_slug);
