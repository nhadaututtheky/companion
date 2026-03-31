CREATE TABLE IF NOT EXISTS web_intel_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_name TEXT NOT NULL,
  docs_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  llm_content TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 1,
  last_accessed_at INTEGER NOT NULL
);

CREATE INDEX idx_webintel_docs_library ON web_intel_docs(library_name);
