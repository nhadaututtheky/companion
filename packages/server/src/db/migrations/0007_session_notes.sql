-- Session notes (persistent, replaces in-memory Map)
CREATE TABLE IF NOT EXISTS session_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session ON session_notes(session_id);
