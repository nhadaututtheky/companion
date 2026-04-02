/**
 * Test database helper — creates an in-memory SQLite with schema for tests.
 * Uses Drizzle's push approach to create tables from schema definition.
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema.js";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(import.meta.dir, "../db/migrations");

/** Create an in-memory test database with all migrations applied. */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  // Apply all migrations in order
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    // Split by statement separator and run each
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      sqlite.run(stmt);
    }
  }

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
