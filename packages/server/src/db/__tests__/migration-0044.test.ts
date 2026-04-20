/**
 * Migration 0044 — session_settings_unify backfill test.
 *
 * Applies migrations 0000→0043, seeds data, then applies 0044 and verifies:
 *   1. New columns exist with expected defaults on greenfield rows.
 *   2. Backfill copies idle_timeout_ms / idle_timeout_enabled from
 *      telegram_session_mappings into sessions for rows that had a mapping.
 *   3. Sessions without a mapping keep the 30-min default (matches
 *      SESSION_IDLE_TIMEOUT_MS in @companion/shared).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  SESSION_IDLE_TIMEOUT_MS,
  DEFAULT_KEEP_ALIVE,
  DEFAULT_AUTO_REINJECT_ON_COMPACT,
  DEFAULT_THINKING_MODE,
  DEFAULT_CONTEXT_MODE,
} from "@companion/shared";

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

function seedProject(sqlite: Database, slug = "test") {
  const now = Date.now();
  sqlite.run(
    `INSERT OR IGNORE INTO projects (slug, name, dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [slug, "Test", "/tmp", now, now],
  );
}

function seedSession(sqlite: Database, id: string, projectSlug = "test") {
  const now = Date.now();
  sqlite.run(
    `INSERT INTO sessions (id, project_slug, model, cwd, started_at) VALUES (?, ?, ?, ?, ?)`,
    [id, projectSlug, "claude-sonnet-4-6", "/tmp", now],
  );
}

function seedMapping(
  sqlite: Database,
  sessionId: string,
  idleTimeoutMs: number,
  idleTimeoutEnabled = 1,
) {
  const now = Date.now();
  sqlite.run(
    `INSERT INTO telegram_session_mappings
      (chat_id, session_id, project_slug, model, idle_timeout_ms, idle_timeout_enabled, created_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, sessionId, "test", "claude-sonnet-4-6", idleTimeoutMs, idleTimeoutEnabled, now, now],
  );
}

describe("migration 0044 — session settings unify", () => {
  it("adds the 6 new columns with hard-coded defaults that match @companion/shared constants", () => {
    const sqlite = freshDbUpTo("0044_session_settings_unify.sql");
    runMigration(sqlite, "0044_session_settings_unify.sql");

    seedProject(sqlite);
    seedSession(sqlite, "s-greenfield");

    const row = sqlite
      .prepare(
        `SELECT idle_timeout_ms, idle_timeout_enabled, keep_alive,
                auto_reinject_on_compact, thinking_mode, context_mode
         FROM sessions WHERE id = ?`,
      )
      .get("s-greenfield") as Record<string, number | string>;

    expect(row.idle_timeout_ms).toBe(SESSION_IDLE_TIMEOUT_MS);
    expect(Boolean(row.idle_timeout_enabled)).toBe(true);
    expect(Boolean(row.keep_alive)).toBe(DEFAULT_KEEP_ALIVE);
    expect(Boolean(row.auto_reinject_on_compact)).toBe(DEFAULT_AUTO_REINJECT_ON_COMPACT);
    expect(row.thinking_mode).toBe(DEFAULT_THINKING_MODE);
    expect(row.context_mode).toBe(DEFAULT_CONTEXT_MODE);

    sqlite.close();
  });

  it("backfills idle_timeout_ms from telegram_session_mappings for existing rows", () => {
    const sqlite = freshDbUpTo("0044_session_settings_unify.sql");

    seedProject(sqlite);
    seedSession(sqlite, "s-with-mapping");
    seedSession(sqlite, "s-without-mapping");
    seedMapping(sqlite, "s-with-mapping", 600_000, 1);

    runMigration(sqlite, "0044_session_settings_unify.sql");

    const withMapping = sqlite
      .prepare(`SELECT idle_timeout_ms, idle_timeout_enabled FROM sessions WHERE id = ?`)
      .get("s-with-mapping") as { idle_timeout_ms: number; idle_timeout_enabled: number };
    expect(withMapping.idle_timeout_ms).toBe(600_000);
    expect(Boolean(withMapping.idle_timeout_enabled)).toBe(true);

    const withoutMapping = sqlite
      .prepare(`SELECT idle_timeout_ms FROM sessions WHERE id = ?`)
      .get("s-without-mapping") as { idle_timeout_ms: number };
    expect(withoutMapping.idle_timeout_ms).toBe(SESSION_IDLE_TIMEOUT_MS);

    sqlite.close();
  });

  it("preserves idle_timeout_enabled=false from an existing disabled mapping", () => {
    const sqlite = freshDbUpTo("0044_session_settings_unify.sql");

    seedProject(sqlite);
    seedSession(sqlite, "s-disabled");
    seedMapping(sqlite, "s-disabled", 3_600_000, 0);

    runMigration(sqlite, "0044_session_settings_unify.sql");

    const row = sqlite
      .prepare(`SELECT idle_timeout_ms, idle_timeout_enabled FROM sessions WHERE id = ?`)
      .get("s-disabled") as { idle_timeout_ms: number; idle_timeout_enabled: number };
    expect(row.idle_timeout_ms).toBe(3_600_000);
    expect(Boolean(row.idle_timeout_enabled)).toBe(false);

    sqlite.close();
  });

  it("leaves telegram_session_mappings.idle_timeout_* intact (migration 0045 drops them)", () => {
    // Stop at 0044 exactly — 0045 is a separate migration with its own test.
    const sqlite = freshDbUpTo("0044_session_settings_unify.sql");
    runMigration(sqlite, "0044_session_settings_unify.sql");

    const cols = sqlite
      .prepare(`PRAGMA table_info(telegram_session_mappings)`)
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("idle_timeout_ms");
    expect(names).toContain("idle_timeout_enabled");

    sqlite.close();
  });
});
