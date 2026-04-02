CREATE TABLE IF NOT EXISTS telegram_forum_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  project_slug TEXT NOT NULL REFERENCES projects(slug),
  topic_id INTEGER NOT NULL,
  topic_name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_chat_project ON telegram_forum_topics(chat_id, project_slug);
CREATE INDEX IF NOT EXISTS idx_forum_chat ON telegram_forum_topics(chat_id);
