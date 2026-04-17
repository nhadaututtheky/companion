-- Per-account custom budget limits (null = fall back to client defaults).
-- Non-idempotent: SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS guard.
-- Safe because the embedded migration runner tracks applied migrations by file name.
ALTER TABLE accounts ADD COLUMN session_5h_budget REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN weekly_budget REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN monthly_budget REAL;
