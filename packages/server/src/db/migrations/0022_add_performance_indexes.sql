-- Composite index for ordered message queries by session
CREATE INDEX IF NOT EXISTS idx_session_messages_session_ts ON session_messages(session_id, timestamp);
--> statement-breakpoint
-- Composite index for daily cost lookups by date + project
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_costs_date_project ON daily_costs(date, project_slug);
--> statement-breakpoint
-- Composite index for telegram mapping lookups by chat + project
CREATE INDEX IF NOT EXISTS idx_telegram_mappings_chat_project ON telegram_session_mappings(chat_id, project_slug);
--> statement-breakpoint
-- Index for session status + ended_at (resumable session queries)
CREATE INDEX IF NOT EXISTS idx_sessions_status_ended ON sessions(status, ended_at);
