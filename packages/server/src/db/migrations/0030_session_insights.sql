-- Session Insights — cross-session learning from patterns, mistakes, preferences
CREATE TABLE IF NOT EXISTS session_insights (
  id TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('pattern', 'mistake', 'preference', 'hotspot')),
  content TEXT NOT NULL,
  source_session_id TEXT NOT NULL DEFAULT '',
  source_files TEXT NOT NULL DEFAULT '[]',
  relevance_score REAL NOT NULL DEFAULT 0.5,
  hit_count INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_insights_project ON session_insights(project_slug);
CREATE INDEX IF NOT EXISTS idx_insights_type ON session_insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_hash ON session_insights(content_hash);
