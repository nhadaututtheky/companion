import { Hono } from "hono";
import { z } from "zod";
import { terminalManager } from "../services/terminal-manager.js";
import type { ApiResponse } from "@companion/shared";

export const terminalRoutes = new Hono();

const spawnSchema = z.object({
  cwd: z.string().min(1),
});

// POST /api/terminal — spawn a new terminal
terminalRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = spawnSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: "Invalid body: cwd is required" } satisfies ApiResponse,
      400,
    );
  }

  const id = terminalManager.spawn(parsed.data.cwd);
  return c.json({ success: true, data: { terminalId: id } } satisfies ApiResponse);
});

// GET /api/terminal — list active terminals
terminalRoutes.get("/", (c) => {
  const terminals = terminalManager.list();
  return c.json({ success: true, data: { terminals } } satisfies ApiResponse);
});

// DELETE /api/terminal/:id — kill a terminal
terminalRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const killed = terminalManager.kill(id);
  if (!killed) {
    return c.json({ success: false, error: "Terminal not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true } satisfies ApiResponse);
});
