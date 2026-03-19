import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { resolve, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import * as schema from "./schema.js";
import { createLogger } from "../logger.js";
import { DB_PATH } from "@companion/shared";

const log = createLogger("db");

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database | null = null;

export function getDb() {
  if (!_db) {
    const dbPath = resolve(process.cwd(), DB_PATH);
    const dbDir = dirname(dbPath);

    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    log.info("Opening database", { path: dbPath });

    _sqlite = new Database(dbPath);
    _sqlite.run("PRAGMA journal_mode = WAL");
    _sqlite.run("PRAGMA foreign_keys = ON");
    _sqlite.run("PRAGMA busy_timeout = 5000");

    _db = drizzle(_sqlite, { schema });
    log.info("Database connected");
  }
  return _db;
}

export function getSqlite() {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
    log.info("Database closed");
  }
}

export { schema };
