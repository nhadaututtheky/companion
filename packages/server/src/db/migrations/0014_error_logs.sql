CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack TEXT,
  session_id TEXT,
  context TEXT,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs(source);
CREATE INDEX IF NOT EXISTS idx_error_logs_session ON error_logs(session_id);
