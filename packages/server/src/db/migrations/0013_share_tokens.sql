-- Share tokens for QR Stream Sharing (Phase 3)
CREATE TABLE IF NOT EXISTS share_tokens (
  token TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  permission TEXT NOT NULL DEFAULT 'read-only',
  created_by TEXT NOT NULL DEFAULT 'owner',
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_session ON share_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_share_tokens_expires ON share_tokens(expires_at);
