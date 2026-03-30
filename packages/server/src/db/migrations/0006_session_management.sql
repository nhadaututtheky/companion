-- Session management: rename, cost budget, compact mode
ALTER TABLE sessions ADD COLUMN name TEXT;
ALTER TABLE sessions ADD COLUMN cost_budget_usd REAL;
ALTER TABLE sessions ADD COLUMN cost_warned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN compact_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE sessions ADD COLUMN compact_threshold INTEGER NOT NULL DEFAULT 75;
