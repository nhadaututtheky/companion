/**
 * Project REST routes — CRUD for project profiles.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getProject,
  listProjects,
  upsertProject,
  deleteProject,
} from "../services/project-profiles.js";
import type { ApiResponse } from "@companion/shared";

const projectSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  dir: z.string().min(1),
  defaultModel: z.string().optional(),
  permissionMode: z.string().optional(),
  envVars: z.record(z.string()).optional(),
});

export const projectRoutes = new Hono();

// List all projects
projectRoutes.get("/", (c) => {
  const items = listProjects();
  return c.json({
    success: true,
    data: items,
    meta: { total: items.length, page: 1, limit: items.length },
  } satisfies ApiResponse);
});

// Get project by slug
projectRoutes.get("/:slug", (c) => {
  const slug = c.req.param("slug");
  const project = getProject(slug);

  if (!project) {
    return c.json(
      { success: false, error: "Project not found" } satisfies ApiResponse,
      404,
    );
  }

  return c.json({ success: true, data: project } satisfies ApiResponse);
});

// Create or update project
projectRoutes.put("/:slug", zValidator("json", projectSchema), (c) => {
  const slug = c.req.param("slug");
  const body = c.req.valid("json");

  upsertProject({
    slug,
    name: body.name,
    dir: body.dir,
    defaultModel: body.defaultModel ?? "claude-sonnet-4-6",
    permissionMode: body.permissionMode ?? "default",
    envVars: body.envVars,
  });

  return c.json({ success: true, data: { slug } } satisfies ApiResponse);
});

// Delete project
projectRoutes.delete("/:slug", (c) => {
  const slug = c.req.param("slug");
  const deleted = deleteProject(slug);

  if (!deleted) {
    return c.json(
      { success: false, error: "Project not found" } satisfies ApiResponse,
      404,
    );
  }

  return c.json({ success: true } satisfies ApiResponse);
});
