-- Harness skill toggles — per-project on/off state for activation rules.
--
-- Why: skill files in `.claude/skills/` are static markdown but their
-- activation behaviour must be project-configurable. Without this table,
-- every skill is "on" for every project (noise) or "off" by default (dead).
-- Phase 1 of the harness-layer plan (.rune/plan-harness-layer-phase1.md).
--
-- Shape: composite primary key (project_slug, skill_id). Absence of a row
-- means "use default from HARNESS_DEFAULT_ENABLED_SKILL_IDS" — lazy creation
-- avoids a backfill migration. Cascade delete on project removal so a
-- deleted project does not leave orphan toggle rows.

CREATE TABLE IF NOT EXISTS harness_skill_toggles (
  project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  PRIMARY KEY (project_slug, skill_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_harness_skill_toggles_project ON harness_skill_toggles(project_slug);
