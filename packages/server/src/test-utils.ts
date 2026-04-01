/**
 * Test utilities — in-memory SQLite DB setup for unit tests.
 * Uses bun:sqlite + drizzle-orm/bun-sqlite (same as production).
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./db/schema.js";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  slug TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  dir TEXT NOT NULL,
  default_model TEXT DEFAULT 'claude-sonnet-4-6' NOT NULL,
  permission_mode TEXT DEFAULT 'default' NOT NULL,
  env_vars TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  short_id TEXT,
  name TEXT,
  project_slug TEXT REFERENCES projects(slug),
  model TEXT NOT NULL,
  status TEXT DEFAULT 'starting' NOT NULL,
  cwd TEXT NOT NULL,
  pid INTEGER,
  permission_mode TEXT DEFAULT 'default' NOT NULL,
  claude_code_version TEXT,
  cli_session_id TEXT,
  source TEXT DEFAULT 'api' NOT NULL,
  parent_id TEXT,
  channel_id TEXT,
  cost_budget_usd REAL,
  cost_warned INTEGER DEFAULT 0 NOT NULL,
  compact_mode TEXT DEFAULT 'manual' NOT NULL,
  compact_threshold INTEGER DEFAULT 75 NOT NULL,
  total_cost_usd REAL DEFAULT 0 NOT NULL,
  num_turns INTEGER DEFAULT 0 NOT NULL,
  total_input_tokens INTEGER DEFAULT 0 NOT NULL,
  total_output_tokens INTEGER DEFAULT 0 NOT NULL,
  cache_creation_tokens INTEGER DEFAULT 0 NOT NULL,
  cache_read_tokens INTEGER DEFAULT 0 NOT NULL,
  total_lines_added INTEGER DEFAULT 0 NOT NULL,
  total_lines_removed INTEGER DEFAULT 0 NOT NULL,
  files_read TEXT DEFAULT '[]',
  files_modified TEXT DEFAULT '[]',
  files_created TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS session_messages (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT DEFAULT 'api' NOT NULL,
  source_id TEXT,
  agent_role TEXT,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_bots (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  role TEXT DEFAULT 'claude' NOT NULL,
  bot_token TEXT NOT NULL,
  allowed_chat_ids TEXT DEFAULT '[]' NOT NULL,
  allowed_user_ids TEXT DEFAULT '[]' NOT NULL,
  enabled INTEGER DEFAULT 1 NOT NULL,
  notification_group_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_session_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  chat_id INTEGER NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  project_slug TEXT NOT NULL,
  model TEXT NOT NULL,
  topic_id INTEGER,
  pinned_message_id INTEGER,
  idle_timeout_enabled INTEGER DEFAULT 1 NOT NULL,
  idle_timeout_ms INTEGER DEFAULT 3600000 NOT NULL,
  cli_session_id TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  date TEXT NOT NULL,
  project_slug TEXT,
  total_cost_usd REAL DEFAULT 0 NOT NULL,
  total_sessions INTEGER DEFAULT 0 NOT NULL,
  total_tokens INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY NOT NULL,
  project_slug TEXT REFERENCES projects(slug),
  type TEXT DEFAULT 'debate' NOT NULL,
  topic TEXT NOT NULL,
  format TEXT,
  status TEXT DEFAULT 'active' NOT NULL,
  max_rounds INTEGER DEFAULT 5 NOT NULL,
  current_round INTEGER DEFAULT 0 NOT NULL,
  verdict TEXT,
  created_at INTEGER NOT NULL,
  concluded_at INTEGER
);

CREATE TABLE IF NOT EXISTS channel_messages (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  round INTEGER DEFAULT 0 NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  project_slug TEXT REFERENCES projects(slug),
  prompt TEXT NOT NULL,
  model TEXT,
  permission_mode TEXT,
  icon TEXT NOT NULL DEFAULT '⚡',
  sort_order INTEGER NOT NULL DEFAULT 0,
  variables TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS session_templates_slug_unique ON session_templates (slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_short_id ON sessions(short_id) WHERE short_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS session_summaries (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  summary TEXT NOT NULL,
  key_decisions TEXT,
  files_modified TEXT,
  created_at INTEGER NOT NULL
);
`;

/**
 * Create a fresh in-memory SQLite database with the full schema.
 * Returns the drizzle instance — close the underlying sqlite via the
 * exported closeTestDb() helper.
 */
export function createTestDb(): {
  db: TestDb;
  sqlite: Database;
  insertProject: (slug: string, name?: string) => void;
} {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  // Run all schema DDL statements split by the migration separator
  const statements = SCHEMA_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    sqlite.run(stmt);
  }

  const db = drizzle(sqlite, { schema });

  /** Insert a minimal project row to satisfy FK constraints */
  function insertProject(slug: string, name = "Test Project"): void {
    const now = Date.now();
    sqlite.run(
      `INSERT OR IGNORE INTO projects (slug, name, dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [slug, name, "/tmp/test", now, now],
    );
  }

  return { db, sqlite, insertProject };
}
