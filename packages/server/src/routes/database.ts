/**
 * Database browser routes — read-only access to project databases.
 * GET    /api/db/connections           — list saved connections
 * POST   /api/db/connections           — add connection
 * DELETE /api/db/connections/:id       — remove connection
 * GET    /api/db/tables/:id            — list tables for connection
 * GET    /api/db/schema/:id/:table     — get table schema
 * POST   /api/db/query                 — execute read-only query
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { dbConnections } from "../db/schema.js";
import { listTables, getTableSchema, executeQuery } from "../services/db-browser.js";
import { randomUUID } from "node:crypto";
import { resolve, normalize } from "node:path";
import { existsSync } from "node:fs";

/** Validate that a connection string points to an allowed path */
function validateDbPath(connStr: string): { ok: true } | { ok: false; error: string } {
  const resolved = resolve(normalize(connStr));
  if (!existsSync(resolved)) {
    return { ok: false, error: "Database file not found" };
  }
  const allowedRoots = process.env.ALLOWED_BROWSE_ROOTS;
  if (allowedRoots) {
    const roots = allowedRoots.split(";").map((r) => resolve(normalize(r)));
    const allowed = roots.some(
      (root) =>
        resolved === root || resolved.startsWith(root + "/") || resolved.startsWith(root + "\\"),
    );
    if (!allowed) {
      return { ok: false, error: "Path outside allowed roots" };
    }
  }
  return { ok: true };
}

export const databaseRoutes = new Hono();

// List saved connections
databaseRoutes.get("/connections", (c) => {
  const db = getDb();
  const rows = db.select().from(dbConnections).all();
  return c.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      connectionString: r.connectionString,
      projectSlug: r.projectSlug,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt as number).toISOString(),
    })),
  });
});

const addConnectionSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["sqlite"]),
  connectionString: z.string().min(1).max(1000),
  projectSlug: z.string().optional(),
});

// Add connection
databaseRoutes.post("/connections", zValidator("json", addConnectionSchema), (c) => {
  const body = c.req.valid("json");

  // Validate path is within allowed roots
  const pathCheck = validateDbPath(body.connectionString);
  if (!pathCheck.ok) {
    return c.json({ success: false, error: pathCheck.error }, 403);
  }

  const db = getDb();
  const id = randomUUID();
  db.insert(dbConnections)
    .values({
      id,
      name: body.name,
      type: body.type,
      connectionString: body.connectionString,
      projectSlug: body.projectSlug ?? null,
    })
    .run();
  return c.json({ success: true, data: { id } }, 201);
});

// Delete connection
databaseRoutes.delete("/connections/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();
  db.delete(dbConnections).where(eq(dbConnections.id, id)).run();
  return c.json({ success: true });
});

// List tables for a connection
databaseRoutes.get("/tables/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();
  const conn = db.select().from(dbConnections).where(eq(dbConnections.id, id)).get();
  if (!conn) return c.json({ success: false, error: "Connection not found" }, 404);

  try {
    const tables = listTables(conn.connectionString);
    return c.json({ success: true, data: tables });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 400);
  }
});

// Get table schema
databaseRoutes.get("/schema/:id/:table", (c) => {
  const { id, table } = c.req.param();
  const db = getDb();
  const conn = db.select().from(dbConnections).where(eq(dbConnections.id, id)).get();
  if (!conn) return c.json({ success: false, error: "Connection not found" }, 404);

  try {
    const schema = getTableSchema(conn.connectionString, table);
    return c.json({ success: true, data: schema });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 400);
  }
});

const querySchema = z.object({
  connectionId: z.string(),
  query: z.string().min(1).max(10000),
  params: z.array(z.unknown()).optional(),
});

// Execute read-only query
databaseRoutes.post("/query", zValidator("json", querySchema), (c) => {
  const { connectionId, query, params } = c.req.valid("json");
  const db = getDb();
  const conn = db.select().from(dbConnections).where(eq(dbConnections.id, connectionId)).get();
  if (!conn) return c.json({ success: false, error: "Connection not found" }, 404);

  try {
    const result = executeQuery(conn.connectionString, query, params);
    return c.json({ success: true, data: result });
  } catch (err) {
    return c.json({ success: false, error: String(err) }, 400);
  }
});
