/**
 * Saved Prompts CRUD routes.
 * GET    /api/saved-prompts?project=  — list (global + project-scoped)
 * POST   /api/saved-prompts           — create
 * PUT    /api/saved-prompts/:id       — update
 * DELETE /api/saved-prompts/:id       — delete
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, or, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { savedPrompts } from "../db/schema.js";

export const savedPromptRoutes = new Hono();

// List saved prompts (global + project-scoped)
savedPromptRoutes.get("/", (c) => {
  const projectSlug = c.req.query("project");
  const db = getDb();

  const rows = projectSlug
    ? db
        .select()
        .from(savedPrompts)
        .where(or(isNull(savedPrompts.projectSlug), eq(savedPrompts.projectSlug, projectSlug)))
        .all()
    : db.select().from(savedPrompts).all();

  // Sort: project-scoped first, then by sort_order
  const sorted = rows.sort((a, b) => {
    if (a.projectSlug && !b.projectSlug) return -1;
    if (!a.projectSlug && b.projectSlug) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  return c.json({ success: true, data: sorted });
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(10000),
  projectSlug: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

// Create saved prompt
savedPromptRoutes.post("/", zValidator("json", createSchema), (c) => {
  const body = c.req.valid("json");
  const db = getDb();
  const id = randomUUID();

  db.insert(savedPrompts)
    .values({
      id,
      name: body.name,
      content: body.content,
      projectSlug: body.projectSlug ?? null,
      tags: body.tags ?? [],
    })
    .run();

  return c.json({ success: true, data: { id } }, 201);
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(10000).optional(),
  projectSlug: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

// Update saved prompt
savedPromptRoutes.put("/:id", zValidator("json", updateSchema), (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");
  const db = getDb();

  const existing = db.select().from(savedPrompts).where(eq(savedPrompts.id, id)).get();
  if (!existing) return c.json({ success: false, error: "Not found" }, 404);

  db.update(savedPrompts)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.projectSlug !== undefined && { projectSlug: body.projectSlug ?? null }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      updatedAt: new Date(),
    })
    .where(eq(savedPrompts.id, id))
    .run();

  return c.json({ success: true });
});

// Delete saved prompt
savedPromptRoutes.delete("/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();
  db.delete(savedPrompts).where(eq(savedPrompts.id, id)).run();
  return c.json({ success: true });
});
