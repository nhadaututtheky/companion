import { Hono } from "hono";
import { z } from "zod";
import { resolve, normalize } from "node:path";
import { existsSync, statSync } from "node:fs";
import { terminalManager } from "../services/terminal-manager.js";
import type { ApiResponse } from "@companion/shared";

export const terminalRoutes = new Hono();

const spawnSchema = z.object({
  cwd: z.string().default(""),
});

/** Validate cwd is a real directory within allowed roots */
function validateCwd(cwd: string): { ok: true; resolved: string } | { ok: false; error: string } {
  const resolved = resolve(normalize(cwd));
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return { ok: false, error: "Path does not exist or is not a directory" };
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
  return { ok: true, resolved };
}

// POST /api/terminal — spawn a new terminal
terminalRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = spawnSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: "Invalid body" } satisfies ApiResponse,
      400,
    );
  }

  const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "/";
  const cwdCheck = validateCwd(parsed.data.cwd || homedir);
  if (!cwdCheck.ok) {
    return c.json({ success: false, error: cwdCheck.error } satisfies ApiResponse, 403);
  }

  const id = terminalManager.spawn(cwdCheck.resolved);
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
