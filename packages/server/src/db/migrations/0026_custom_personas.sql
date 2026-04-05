CREATE TABLE IF NOT EXISTS custom_personas (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🧠',
  title TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  mental_models TEXT NOT NULL DEFAULT '[]',
  decision_framework TEXT NOT NULL DEFAULT '',
  red_flags TEXT NOT NULL DEFAULT '[]',
  communication_style TEXT NOT NULL DEFAULT '',
  blind_spots TEXT NOT NULL DEFAULT '[]',
  best_for TEXT NOT NULL DEFAULT '[]',
  strength TEXT NOT NULL DEFAULT '',
  avatar_gradient TEXT NOT NULL DEFAULT '["#6366f1","#8b5cf6"]',
  avatar_initials TEXT NOT NULL DEFAULT 'CP',
  combinable_with TEXT,
  cloned_from TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_custom_personas_slug ON custom_personas(slug);
