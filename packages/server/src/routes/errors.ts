/**
 * Error log routes — view and manage tracked errors.
 * GET    /api/errors         — list errors with filters
 * GET    /api/errors/export  — export all errors as JSON
 * DELETE /api/errors         — clear all error logs
 */

import { Hono } from "hono";
import { getErrors, clearErrors } from "../services/error-tracker.js";

export const errorRoutes = new Hono();

errorRoutes.get("/", (c) => {
  const source = c.req.query("source");
  const sessionId = c.req.query("sessionId");
  const since = c.req.query("since");
  const limit = c.req.query("limit");
  const offset = c.req.query("offset");

  const result = getErrors({
    source: source || undefined,
    sessionId: sessionId || undefined,
    since: since ? parseInt(since, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });

  return c.json({
    success: true,
    data: result.errors,
    meta: { total: result.total, limit: result.limit, offset: result.offset },
  });
});

errorRoutes.get("/export", (c) => {
  const result = getErrors({ limit: 200 });
  c.header("Content-Disposition", `attachment; filename="companion-errors-${Date.now()}.json"`);
  return c.json(result.errors);
});

errorRoutes.delete("/", (c) => {
  const cleared = clearErrors();
  return c.json({ success: true, data: { cleared } });
});
