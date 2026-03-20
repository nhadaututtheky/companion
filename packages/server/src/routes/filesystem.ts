/**
 * Filesystem browsing routes — safe, read-only directory listing for the session
 * project-directory picker in the browser UI.
 */

import { Hono } from "hono";
import { readdirSync, statSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve, normalize } from "path";
import type { ApiResponse } from "@companion/shared";

// Directories filtered out of listings (noisy / irrelevant for project selection)
const HIDDEN_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".DS_Store",
]);

/** Validate that a path is an existing directory and not obviously dangerous */
function validateDir(p: string): { ok: true; resolved: string } | { ok: false; error: string; status: 400 | 403 } {
  if (!p || typeof p !== "string") {
    return { ok: false, error: "path is required", status: 400 };
  }

  let resolved: string;
  try {
    resolved = resolve(normalize(p));
  } catch {
    return { ok: false, error: "Invalid path", status: 400 };
  }

  if (!existsSync(resolved)) {
    return { ok: false, error: "Path does not exist", status: 400 };
  }

  try {
    const stat = statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, error: "Path is not a directory", status: 400 };
    }
  } catch {
    return { ok: false, error: "Cannot stat path", status: 400 };
  }

  // Optionally restrict to configured roots
  const allowedRoots = process.env.ALLOWED_BROWSE_ROOTS;
  if (allowedRoots) {
    const roots = allowedRoots.split(";").map((r) => resolve(normalize(r)));
    const allowed = roots.some((root) => resolved.startsWith(root));
    if (!allowed) {
      return { ok: false, error: "Path outside allowed roots", status: 403 };
    }
  }

  return { ok: true, resolved };
}

export const filesystemRoutes = new Hono();

/**
 * GET /api/fs/browse?path=<dir>
 * Returns subdirectories (and optionally files) of the given path.
 */
filesystemRoutes.get("/browse", (c) => {
  const rawPath = c.req.query("path") ?? "";
  const includeFiles = c.req.query("files") === "true";

  const check = validateDir(rawPath);
  if (!check.ok) {
    return c.json(
      { success: false, error: check.error } satisfies ApiResponse,
      check.status,
    );
  }

  let entries: string[];
  try {
    entries = readdirSync(check.resolved);
  } catch {
    return c.json(
      { success: false, error: "Cannot read directory" } satisfies ApiResponse,
      500,
    );
  }

  const dirs: string[] = [];
  const files: string[] = [];

  for (const entry of entries) {
    // Skip hidden entries and known noisy dirs
    if (entry.startsWith(".") || HIDDEN_DIRS.has(entry)) continue;

    try {
      const fullPath = join(check.resolved, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        dirs.push(entry);
      } else if (includeFiles) {
        files.push(entry);
      }
    } catch {
      // skip unreadable entries
    }
  }

  return c.json({
    success: true,
    data: {
      path: check.resolved,
      dirs: dirs.sort(),
      files: includeFiles ? files.sort() : [],
    },
  } satisfies ApiResponse);
});

/**
 * GET /api/fs/roots
 * Returns the home directory and any additional configured project roots.
 */
filesystemRoutes.get("/roots", (c) => {
  const home = homedir();
  const roots: { label: string; path: string }[] = [];

  // If ALLOWED_BROWSE_ROOTS is set, ONLY show those roots (e.g. Docker mounted dirs)
  const configured = process.env.ALLOWED_BROWSE_ROOTS;
  if (configured) {
    for (const r of configured.split(";")) {
      const normalized = resolve(normalize(r));
      if (existsSync(normalized)) {
        roots.push({ label: normalized.split(/[\\/]/).pop() ?? normalized, path: normalized });
      }
    }
  }

  // Only add system roots if no configured roots (dev mode / native)
  if (roots.length === 0) {
    roots.push({ label: "Home", path: home });

    if (process.platform === "win32") {
      for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        const drive = `${letter}:\\`;
        try {
          if (existsSync(drive)) {
            roots.push({ label: `${letter}:`, path: drive });
          }
        } catch { /* skip */ }
      }
    } else {
      for (const cp of [
        { label: "Root", path: "/" },
        { label: "Volumes", path: "/Volumes" },
        { label: "Users", path: "/Users" },
      ]) {
        if (existsSync(cp.path) && cp.path !== home) {
          roots.push(cp);
        }
      }
    }
  }

  return c.json({
    success: true,
    data: { roots },
  } satisfies ApiResponse);
});
