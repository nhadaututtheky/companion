/**
 * DbBrowser — read-only database browsing for project databases.
 * Currently supports SQLite only. All connections are forced read-only.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const MAX_ROWS = 1000;

/** Open a read-only SQLite connection. Throws on invalid path. */
function openReadOnly(filePath: string): Database {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`Database file not found: ${resolved}`);
  }
  const db = new Database(resolved, { readonly: true });
  db.exec("PRAGMA query_only = ON");
  return db;
}

/** List tables in a SQLite database. */
export function listTables(filePath: string): Array<{ name: string; type: string }> {
  const db = openReadOnly(filePath);
  try {
    const rows = db
      .query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string; type: string }>;
    return rows;
  } finally {
    db.close();
  }
}

/** Get column info for a table. */
export function getTableSchema(
  filePath: string,
  tableName: string,
): Array<{
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}> {
  // Validate table name to prevent injection (only allow alphanumeric + underscore)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error("Invalid table name");
  }
  const db = openReadOnly(filePath);
  try {
    const rows = db.query(`PRAGMA table_info("${tableName}")`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    return rows;
  } finally {
    db.close();
  }
}

/** Execute a read-only query with parameterized values. Max 1000 rows.
 * Safety: connection is opened readonly + PRAGMA query_only = ON.
 * Write attempts are rejected at the SQLite engine level. */
export function executeQuery(
  filePath: string,
  query: string,
  params?: unknown[],
): { columns: string[]; rows: unknown[][]; rowCount: number; truncated: boolean } {
  const db = openReadOnly(filePath);
  try {
    // Add LIMIT if not present
    const hasLimit = /\bLIMIT\b/i.test(query);
    const finalQuery = hasLimit ? query : `${query} LIMIT ${MAX_ROWS + 1}`;

    const stmt = db.prepare(finalQuery);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawRows = (params ? stmt.all(...(params as any[])) : stmt.all()) as Record<
      string,
      unknown
    >[];

    const truncated = rawRows.length > MAX_ROWS;
    const resultRows = truncated ? rawRows.slice(0, MAX_ROWS) : rawRows;
    const columns = resultRows.length > 0 ? Object.keys(resultRows[0] as object) : [];

    return {
      columns,
      rows: resultRows.map((r) => columns.map((c) => r[c])),
      rowCount: resultRows.length,
      truncated,
    };
  } finally {
    db.close();
  }
}
