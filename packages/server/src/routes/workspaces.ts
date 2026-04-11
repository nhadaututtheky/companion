/**
 * Workspace REST routes — CRUD + CLI connection management.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  connectCli,
  disconnectCli,
} from "../services/workspace-store.js";
import type { ApiResponse } from "@companion/shared";

const CLI_PLATFORMS = ["claude", "codex", "gemini", "opencode"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  projectSlug: z.string().min(1),
  cliSlots: z.array(z.enum(CLI_PLATFORMS)).optional(),
  defaultExpert: z.string().optional(),
  autoConnect: z.boolean().optional(),
  wikiDomain: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  cliSlots: z.array(z.enum(CLI_PLATFORMS)).optional(),
  defaultExpert: z.string().nullable().optional(),
  autoConnect: z.boolean().optional(),
  wikiDomain: z.string().nullable().optional(),
});

export function workspaceRoutes(): Hono {
  const app = new Hono();

  // List all workspaces
  app.get("/", (c) => {
    const items = listWorkspaces();
    return c.json({
      success: true,
      data: items,
      meta: { total: items.length, page: 1, limit: items.length },
    } satisfies ApiResponse);
  });

  // Get workspace with CLI status
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const ws = getWorkspace(id);
    if (!ws) {
      return c.json({ success: false, error: "Workspace not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: ws } satisfies ApiResponse);
  });

  // Create workspace
  app.post("/", zValidator("json", createSchema), (c) => {
    const body = c.req.valid("json");
    try {
      const ws = createWorkspace(body);
      return c.json({ success: true, data: ws } satisfies ApiResponse, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create workspace";
      return c.json({ success: false, error: message } satisfies ApiResponse, 400);
    }
  });

  // Update workspace
  app.put("/:id", zValidator("json", updateSchema), (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const ws = updateWorkspace(id, body);
    if (!ws) {
      return c.json({ success: false, error: "Workspace not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: ws } satisfies ApiResponse);
  });

  // Delete workspace
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const deleted = deleteWorkspace(id);
    if (!deleted) {
      return c.json({ success: false, error: "Workspace not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true } satisfies ApiResponse);
  });

  // Connect a CLI to workspace
  app.post(
    "/:id/connect",
    zValidator(
      "json",
      z.object({
        platform: z.enum(CLI_PLATFORMS),
        sessionId: z.string().min(1),
      }),
    ),
    (c) => {
      const id = c.req.param("id");
      const ws = getWorkspace(id);
      if (!ws) {
        return c.json({ success: false, error: "Workspace not found" } satisfies ApiResponse, 404);
      }
      const { platform, sessionId } = c.req.valid("json");
      connectCli(id, platform, sessionId);
      return c.json({ success: true } satisfies ApiResponse);
    },
  );

  // Disconnect a CLI from workspace
  app.post("/:id/disconnect/:cli", (c) => {
    const id = c.req.param("id");
    const cli = c.req.param("cli");
    if (!CLI_PLATFORMS.includes(cli as (typeof CLI_PLATFORMS)[number])) {
      return c.json({ success: false, error: "Invalid CLI platform" } satisfies ApiResponse, 400);
    }
    const ws = getWorkspace(id);
    if (!ws) {
      return c.json({ success: false, error: "Workspace not found" } satisfies ApiResponse, 404);
    }
    disconnectCli(id, cli as (typeof CLI_PLATFORMS)[number]);
    return c.json({ success: true } satisfies ApiResponse);
  });

  return app;
}
