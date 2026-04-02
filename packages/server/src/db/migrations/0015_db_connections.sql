CREATE TABLE IF NOT EXISTS db_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  connection_string TEXT NOT NULL,
  project_slug TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
