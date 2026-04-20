/**
 * Migration 0045 — drop legacy telegram_session_mappings.idle_timeout_*.
 *
 * Columns were replaced by `sessions.idle_timeout_ms` + `idle_timeout_enabled`
 * in migration 0044. This migration removes the now-dead columns from the
 * mapping table so the grep audit (scripts/check-settings-consistency.ts)
 * has nothing to compete with and future schema work is cleaner.
 *
 * Tests:
 *   1. Columns present before 0045, gone after.
 *   2. Existing rows (chat_id, session_id, cli_session_id, ...) survive.
 *   3. INSERT without idle_timeout_* still works (schema.ts no longer
 *      supplies them).
 */

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(import.meta.dir, "..", "migrations");

function runMigration(sqlite: Database, file: string) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) sqlite.run(stmt);
}

function freshDbUpTo(exclusiveFile: string): Database {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f < exclusiveFile)
    .sort();
  for (const f of files) runMigration(sqlite, f);
  return sqlite;
}

describe("migration 0045 — drop telegram idle columns", () => {
  it("removes idle_timeout_ms + idle_timeout_enabled from telegram_session_mappings", () => {
    const sqlite = freshDbUpTo("0045_drop_telegram_idle_columns.sql");

    const before = sqlite
      .prepare(`PRAGMA table_info(telegram_session_mappings)`)
      .all() as Array<{ name: string }>;
    expect(before.map((c) => c.name)).toContain("idle_timeout_ms");
    expect(before.map((c) => c.name)).toContain("idle_timeout_enabled");

    runMigration(sqlite, "0045_drop_telegram_idle_columns.sql");

    const after = sqlite
      .prepare(`PRAGMA table_info(telegram_session_mappings)`)
      .all() as Array<{ name: string }>;
    expect(after.map((c) => c.name)).not.toContain("idle_timeout_ms");
    expect(after.map((c) => c.name)).not.toContain("idle_timeout_enabled");

    sqlite.close();
  });

  it("preserves existing mapping rows", () => {
    const sqlite = freshDbUpTo("0045_drop_telegram_idle_columns.sql");

    const now = Date.now();
    sqlite.run(
      `INSERT OR IGNORE INTO projects (slug, name, dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["p", "Test", "/tmp", now, now],
    );
    sqlite.run(
      `INSERT INTO sessions (id, project_slug, model, cwd, started_at) VALUES (?, ?, ?, ?, ?)`,
      ["s1", "p", "claude-sonnet-4-6", "/tmp", now],
    );
    sqlite.run(
      `INSERT INTO telegram_session_mappings
         (chat_id, session_id, project_slug, model, cli_session_id, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [42, "s1", "p", "claude-sonnet-4-6", "cli-abc", now, now],
    );

    runMigration(sqlite, "0045_drop_telegram_idle_columns.sql");

    const row = sqlite
      .prepare(`SELECT chat_id, session_id, cli_session_id FROM telegram_session_mappings`)
      .get() as { chat_id: number; session_id: string; cli_session_id: string };
    expect(row.chat_id).toBe(42);
    expect(row.session_id).toBe("s1");
    expect(row.cli_session_id).toBe("cli-abc");

    sqlite.close();
  });

  it("INSERT without idle_timeout_* still succeeds post-migration", () => {
    const sqlite = freshDbUpTo("0045_drop_telegram_idle_columns.sql");
    runMigration(sqlite, "0045_drop_telegram_idle_columns.sql");

    const now = Date.now();
    sqlite.run(
      `INSERT OR IGNORE INTO projects (slug, name, dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["p", "T", "/tmp", now, now],
    );
    sqlite.run(
      `INSERT INTO sessions (id, project_slug, model, cwd, started_at) VALUES (?, ?, ?, ?, ?)`,
      ["s2", "p", "claude-sonnet-4-6", "/tmp", now],
    );
    // Columns for idle timeout no longer exist — this is the typical insert
    // schema.ts now emits.
    sqlite.run(
      `INSERT INTO telegram_session_mappings
         (chat_id, session_id, project_slug, model, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, "s2", "p", "claude-sonnet-4-6", now, now],
    );

    const row = sqlite
      .prepare(`SELECT COUNT(*) as n FROM telegram_session_mappings WHERE session_id = 's2'`)
      .get() as { n: number };
    expect(row.n).toBe(1);

    sqlite.close();
  });
});
