-- Track which account was used for each session (multi-account management)
ALTER TABLE sessions ADD COLUMN account_id TEXT;
