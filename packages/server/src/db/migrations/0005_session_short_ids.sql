-- Add short_id column for @mention system
ALTER TABLE sessions ADD COLUMN short_id TEXT;

-- Unique index for short_id (partial — allows multiple NULLs)
CREATE UNIQUE INDEX idx_sessions_short_id ON sessions(short_id) WHERE short_id IS NOT NULL;
