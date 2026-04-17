-- Per-account custom budget limits (null = no limit)
ALTER TABLE accounts ADD COLUMN session_5h_budget REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN weekly_budget REAL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN monthly_budget REAL;
