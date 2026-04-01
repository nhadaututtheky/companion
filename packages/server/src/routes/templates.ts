/**
 * Template REST API routes.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../services/templates.js";
import type { ApiResponse } from "@companion/shared";

const templateVariableSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  defaultValue: z.string().optional(),
  required: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  projectSlug: z.string().nullish(),
  prompt: z.string().min(1).max(10000),
  model: z.string().nullish(),
  permissionMode: z.string().nullish(),
  icon: z.string().max(10).optional(),
  sortOrder: z.number().int().min(0).optional(),
  variables: z.array(templateVariableSchema).nullish(),
});

const updateSchema = createSchema.partial();

export function templateRoutes(): Hono {
  const app = new Hono();

  // GET / — list templates (optionally filter by project)
  app.get("/", (c) => {
    const project = c.req.query("project");
    const templates = listTemplates(project ?? undefined);
    return c.json({ success: true, data: templates } satisfies ApiResponse);
  });

  // GET /:id — get single template
  app.get("/:id", (c) => {
    const template = getTemplate(c.req.param("id"));
    if (!template) {
      return c.json({ success: false, error: "Template not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: template } satisfies ApiResponse);
  });

  // POST / — create template
  app.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON body" } satisfies ApiResponse, 400);
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.message } satisfies ApiResponse, 400);
    }
    try {
      const template = createTemplate(parsed.data);
      return c.json({ success: true, data: template } satisfies ApiResponse, 201);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("UNIQUE")) {
        return c.json(
          {
            success: false,
            error: "A template with that slug already exists",
          } satisfies ApiResponse,
          409,
        );
      }
      throw err;
    }
  });

  // PUT /:id — update template
  app.put("/:id", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON body" } satisfies ApiResponse, 400);
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.message } satisfies ApiResponse, 400);
    }
    try {
      const template = updateTemplate(c.req.param("id"), parsed.data);
      if (!template) {
        return c.json({ success: false, error: "Template not found" } satisfies ApiResponse, 404);
      }
      return c.json({ success: true, data: template } satisfies ApiResponse);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("UNIQUE")) {
        return c.json(
          {
            success: false,
            error: "A template with that slug already exists",
          } satisfies ApiResponse,
          409,
        );
      }
      throw err;
    }
  });

  // DELETE /:id — delete template
  app.delete("/:id", (c) => {
    const deleted = deleteTemplate(c.req.param("id"));
    if (!deleted) {
      return c.json({ success: false, error: "Template not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: { deleted: true } } satisfies ApiResponse);
  });

  return app;
}
