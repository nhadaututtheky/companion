/**
 * Test utilities — in-memory SQLite DB setup for unit tests.
 * Uses bun:sqlite + drizzle-orm/bun-sqlite (same as production).
 * Applies all migrations from db/migrations/ for schema accuracy.
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as schema from "./db/schema.js";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

const MIGRATIONS_DIR = resolve(import.meta.dir, "db/migrations");

/**
 * Create a fresh in-memory SQLite database with the full schema.
 * Applies all migration files for accurate schema.
 */
export function createTestDb(): {
  db: TestDb;
  sqlite: Database;
  insertProject: (slug: string, name?: string) => void;
} {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  // Apply all migrations in order
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      sqlite.run(stmt);
    }
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
