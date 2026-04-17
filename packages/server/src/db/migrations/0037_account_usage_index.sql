-- Composite index for per-account usage queries (rolling windows, heatmap, model breakdown)
CREATE INDEX IF NOT EXISTS idx_sessions_account_started ON sessions(account_id, started_at);
