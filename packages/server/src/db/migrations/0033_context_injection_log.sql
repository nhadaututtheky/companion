CREATE TABLE IF NOT EXISTS context_injection_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project_slug TEXT NOT NULL DEFAULT '',
  injection_type TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_ctx_injection_session ON context_injection_log(session_id);
CREATE INDEX IF NOT EXISTS idx_ctx_injection_type ON context_injection_log(injection_type);
CREATE INDEX IF NOT EXISTS idx_ctx_injection_created ON context_injection_log(created_at);
