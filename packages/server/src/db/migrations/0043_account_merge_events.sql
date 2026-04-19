-- Phase 3: Multi Account dedup conflict-resolution events.
--
-- When `mergeAccountsBySubject` collapses duplicate rows that owned different
-- non-null budget caps, we silently keep the maximum (safer than raising a cap
-- to null). This table records the original budgets so the user can review and
-- override the merge result via a banner in the Accounts Manager UI.
--
-- One row per merge event. `resolved_at` is set when the user acts on it
-- (either accepts the auto-pick or applies a different choice).
CREATE TABLE IF NOT EXISTS account_merge_events (
  id TEXT PRIMARY KEY,
  -- Survivor account that absorbed the duplicates. Cascade-delete with the
  -- account so a user nuking the survivor doesn't leave orphan banners.
  survivor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Anthropic canonical subject (account.uuid) the event was keyed on. Logged
  -- for support/debugging — no UI surface.
  oauth_subject TEXT NOT NULL,
  -- JSON snapshot: array of { id, label, session5hBudget, weeklyBudget,
  -- monthlyBudget, totalCostUsd } for every row in the merge group BEFORE the
  -- merge ran. Lets the UI render a per-row dropdown without needing the
  -- (now deleted) duplicate rows.
  before_state TEXT NOT NULL,
  -- Effective budgets the survivor was left with after the merge. Mirrors
  -- accounts.* columns at merge-time so the banner can show "we picked $X".
  applied_session5h_budget REAL,
  applied_weekly_budget REAL,
  applied_monthly_budget REAL,
  merged_at INTEGER NOT NULL,
  -- NULL until user dismisses or applies a budget choice. Once set, banner
  -- hides this event.
  resolved_at INTEGER,
  -- Optional audit: which choice the user picked. "kept" = accepted auto-max,
  -- "applied:<accountId>" = picked one of the original rows' budgets.
  resolved_choice TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_merge_events_pending
  ON account_merge_events(survivor_account_id)
  WHERE resolved_at IS NULL;
