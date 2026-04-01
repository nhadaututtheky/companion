import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { getSqlite } from "./client.js";
import { createLogger } from "../logger.js";
import { EMBEDDED_MIGRATIONS } from "./embedded-migrations.js";

const log = createLogger("migrate");

/** Load migrations from filesystem (dev) or embedded constants (compiled binary) */
function loadMigrations(): Array<{ name: string; sql: string }> {
  // Try filesystem first (works in dev, fails in compiled binary)
  const migrationsDir = resolve(import.meta.dir, "migrations");
  if (existsSync(migrationsDir)) {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    return files.map((name) => ({
      name,
      sql: readFileSync(resolve(migrationsDir, name), "utf-8"),
    }));
  }

  // Fallback: embedded migrations (compiled sidecar binary)
  log.info("Using embedded migrations (compiled mode)");
  return EMBEDDED_MIGRATIONS;
}

export function runMigrations() {
  const sqlite = getSqlite();

  // Create migrations tracking table
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  // Get applied migrations
  const applied = new Set(
    sqlite
      .prepare("SELECT hash FROM __drizzle_migrations")
      .all()
      .map((row) => (row as { hash: string }).hash),
  );

  // Load and apply pending migrations
  const migrations = loadMigrations();

  for (const { name, sql } of migrations) {
    if (applied.has(name)) continue;

    log.info("Applying migration", { file: name });

    // Split by statement breakpoint and execute each
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    sqlite.run("BEGIN");
    try {
      for (const stmt of statements) {
        try {
          sqlite.run(stmt);
        } catch (stmtErr) {
          // SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS —
          // skip "duplicate column" errors from partially-applied migrations
          if (String(stmtErr).includes("duplicate column name")) {
            log.warn("Skipping duplicate column (already exists)", {
              file: name,
              stmt: stmt.slice(0, 80),
            });
            continue;
          }
          throw stmtErr;
        }
      }
      sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [
        name,
        Date.now(),
      ]);
      sqlite.run("COMMIT");
      log.info("Migration applied", { file: name });
    } catch (err) {
      sqlite.run("ROLLBACK");
      log.error("Migration failed", { file: name, error: String(err) });
      throw err;
    }
  }
}
