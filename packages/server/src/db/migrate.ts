import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { getSqlite } from "./client.js";
import { createLogger } from "../logger.js";

const log = createLogger("migrate");

export function runMigrations() {
  const sqlite = getSqlite();
  const migrationsDir = resolve(import.meta.dir, "migrations");

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

  // Read and apply pending migrations
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    log.info("Applying migration", { file });
    const sql = readFileSync(resolve(migrationsDir, file), "utf-8");

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
              file,
              stmt: stmt.slice(0, 80),
            });
            continue;
          }
          throw stmtErr;
        }
      }
      sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [
        file,
        Date.now(),
      ]);
      sqlite.run("COMMIT");
      log.info("Migration applied", { file });
    } catch (err) {
      sqlite.run("ROLLBACK");
      log.error("Migration failed", { file, error: String(err) });
      throw err;
    }
  }
}
