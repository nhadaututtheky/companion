/**
 * Plan Review routes — serve .md files for rich review + inline commenting.
 *
 * Endpoints:
 *   GET  /api/review/files?project=slug         — list reviewable .md files
 *   GET  /api/review/read?project=slug&file=path — read file content
 *   POST /api/review/comment                     — inject inline comment into .md
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve, sep } from "path";
import type { ApiResponse } from "@companion/shared";
import { listProjects } from "../services/project-profiles.js";

function resolveProjectPath(projectSlug: string): string | null {
  const projects = listProjects();
  const proj = projects.find((p) => p.slug === projectSlug);
  return proj?.dir ?? null;
}

/** Validate that resolved path stays inside project root */
function isSafePath(projectRoot: string, filePath: string): boolean {
  const resolved = resolve(projectRoot, filePath);
  const root = resolve(projectRoot);
  return resolved.startsWith(root + sep) || resolved === root;
}

export function createReviewRoutes(): Hono {
  const app = new Hono();

  // ── List reviewable .md files ──────────────────────────────────────────

  app.get("/files", zValidator("query", z.object({ project: z.string() })), (c) => {
    const { project } = c.req.valid("query");
    const projectPath = resolveProjectPath(project);
    if (!projectPath) {
      return c.json<ApiResponse>({ success: false, error: "Project not found" }, 404);
    }

    const files: Array<{ name: string; path: string; size: number; modified: string }> = [];

    // Scan .rune/ for plan/doc files
    const runeDir = join(projectPath, ".rune");
    if (existsSync(runeDir)) {
      try {
        for (const entry of readdirSync(runeDir)) {
          if (!entry.endsWith(".md")) continue;
          const fullPath = join(runeDir, entry);
          const stat = statSync(fullPath);
          if (stat.isFile()) {
            files.push({
              name: entry,
              path: `.rune/${entry}`,
              size: stat.size,
              modified: stat.mtime.toISOString(),
            });
          }
        }
      } catch {
        // .rune not readable — skip
      }
    }

    // Scan project root for top-level .md files
    try {
      for (const entry of readdirSync(projectPath)) {
        if (!entry.endsWith(".md") || entry.startsWith(".")) continue;
        const fullPath = join(projectPath, entry);
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          files.push({
            name: entry,
            path: entry,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
    } catch {
      // root not readable — skip
    }

    // Sort: most recently modified first
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return c.json<ApiResponse>({ success: true, data: files });
  });

  // ── Read file content ─────────────────────────────────────────────────

  app.get(
    "/read",
    zValidator("query", z.object({ project: z.string(), file: z.string() })),
    (c) => {
      const { project, file } = c.req.valid("query");
      const projectPath = resolveProjectPath(project);
      if (!projectPath) {
        return c.json<ApiResponse>({ success: false, error: "Project not found" }, 404);
      }

      if (!file.endsWith(".md")) {
        return c.json<ApiResponse>({ success: false, error: "Only .md files supported" }, 400);
      }

      if (!isSafePath(projectPath, file)) {
        return c.json<ApiResponse>({ success: false, error: "Invalid path" }, 400);
      }

      const fullPath = resolve(projectPath, file);
      if (!existsSync(fullPath)) {
        return c.json<ApiResponse>({ success: false, error: "File not found" }, 404);
      }

      const content = readFileSync(fullPath, "utf-8");
      return c.json<ApiResponse>({ success: true, data: { path: file, content } });
    },
  );

  // ── Inject inline comment ─────────────────────────────────────────────

  app.post(
    "/comment",
    zValidator(
      "json",
      z.object({
        project: z.string(),
        file: z.string(),
        afterLine: z.number().int().min(1),
        comment: z.string().min(1).max(2000),
        selectedText: z.string().max(300).optional(),
      }),
    ),
    (c) => {
      const { project, file, afterLine, comment, selectedText } = c.req.valid("json");
      const projectPath = resolveProjectPath(project);
      if (!projectPath) {
        return c.json<ApiResponse>({ success: false, error: "Project not found" }, 404);
      }

      if (!file.endsWith(".md") || !isSafePath(projectPath, file)) {
        return c.json<ApiResponse>({ success: false, error: "Invalid file" }, 400);
      }

      const fullPath = resolve(projectPath, file);
      if (!existsSync(fullPath)) {
        return c.json<ApiResponse>({ success: false, error: "File not found" }, 404);
      }

      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      // Build comment blockquote
      const parts: string[] = [""];
      if (selectedText) {
        parts.push(`> _"${selectedText.slice(0, 200)}"_`);
      }
      parts.push(`> **💬 User**: ${comment}`);
      parts.push("");

      const insertAt = Math.min(afterLine, lines.length);
      lines.splice(insertAt, 0, ...parts);

      writeFileSync(fullPath, lines.join("\n"), "utf-8");

      return c.json<ApiResponse>({ success: true, data: { insertedAt: insertAt } }, 201);
    },
  );

  return app;
}
