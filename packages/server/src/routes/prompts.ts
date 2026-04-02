/**
 * Prompt history routes — search and re-send previous prompts.
 * GET  /api/prompts?sessionId=&q=&limit= — list/search user prompts
 * POST /api/prompts/resend                — re-send prompt to active session
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, like, and, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessionMessages, sessions } from "../db/schema.js";
import type { WsBridge } from "../services/ws-bridge.js";
import { getActiveSession } from "../services/session-store.js";

export function promptRoutes(bridge: WsBridge) {
  const routes = new Hono();

  // List/search user prompts across sessions
  routes.get("/", (c) => {
    const db = getDb();
    const sessionId = c.req.query("sessionId");
    const q = c.req.query("q");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);

    const conditions = [eq(sessionMessages.role, "user")];
    if (sessionId) conditions.push(eq(sessionMessages.sessionId, sessionId));
    if (q) {
      // Escape LIKE special characters
      const escaped = q.replace(/[%_]/g, (ch) => `\\${ch}`);
      conditions.push(like(sessionMessages.content, `%${escaped}%`));
    }

    const rows = db
      .select({
        id: sessionMessages.id,
        sessionId: sessionMessages.sessionId,
        content: sessionMessages.content,
        source: sessionMessages.source,
        timestamp: sessionMessages.timestamp,
        sessionName: sessions.name,
        projectSlug: sessions.projectSlug,
      })
      .from(sessionMessages)
      .leftJoin(sessions, eq(sessionMessages.sessionId, sessions.id))
      .where(and(...conditions))
      .orderBy(desc(sessionMessages.timestamp))
      .limit(limit)
      .offset(offset)
      .all();

    const countRow = db
      .select({ count: sql<number>`count(*)` })
      .from(sessionMessages)
      .where(and(...conditions))
      .get();

    return c.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        sessionName: r.sessionName,
        projectSlug: r.projectSlug,
        content: r.content,
        source: r.source,
        createdAt:
          r.timestamp instanceof Date
            ? r.timestamp.toISOString()
            : new Date(r.timestamp as number).toISOString(),
      })),
      meta: { total: countRow?.count ?? 0, limit, offset },
    });
  });

  const resendSchema = z.object({
    sessionId: z.string(),
    content: z.string().min(1).max(100000),
  });

  // Re-send a prompt to an active session
  routes.post("/resend", zValidator("json", resendSchema), (c) => {
    const { sessionId, content } = c.req.valid("json");

    const session = getActiveSession(sessionId);
    if (!session) {
      return c.json({ success: false, error: "Session not active" }, 400);
    }

    try {
      bridge.sendUserMessage(sessionId, content, "web");
      return c.json({ success: true });
    } catch (err) {
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  return routes;
}
