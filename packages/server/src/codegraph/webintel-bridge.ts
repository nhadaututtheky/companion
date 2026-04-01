/**
 * CodeGraph ↔ WebIntel Bridge
 *
 * After a code graph scan, extracts external package imports and makes them
 * available for WebIntel auto-doc injection. This allows the agent context
 * to include documentation for libraries actually used in the project.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { codeEdges, codeNodes } from "../db/schema.js";

/**
 * Extract unique external package names from a project's import edges.
 * External = import path doesn't start with "." or "/" (not relative).
 */
export function getExternalPackages(projectSlug: string): string[] {
  const db = getDb();

  // Get all import/uses_type edges with their context (which contains the import path)
  const edges = db
    .select({ context: codeEdges.context, edgeType: codeEdges.edgeType })
    .from(codeEdges)
    .where(eq(codeEdges.projectSlug, projectSlug))
    .all();

  const packages = new Set<string>();

  for (const edge of edges) {
    if (edge.edgeType !== "imports" && edge.edgeType !== "uses_type") continue;
    if (!edge.context) continue;

    // Extract the from path from context like: import { X } from "package-name"
    const fromMatch = edge.context.match(/from\s+['"]([^'"]+)['"]/);
    if (!fromMatch) continue;

    const fromPath = fromMatch[1]!;

    // Skip relative imports
    if (fromPath.startsWith(".") || fromPath.startsWith("/")) continue;

    // Extract package name (handle scoped packages like @scope/name)
    const parts = fromPath.split("/");
    const pkgName =
      fromPath.startsWith("@") && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]!;

    // Skip Node.js built-ins
    if (isNodeBuiltin(pkgName)) continue;

    packages.add(pkgName);
  }

  return [...packages].sort();
}

/**
 * Get a mapping of external packages → how many files import them.
 * Useful for prioritizing which docs to fetch first.
 */
export function getPackageUsageCounts(projectSlug: string): Map<string, number> {
  const db = getDb();

  const edges = db
    .select({
      context: codeEdges.context,
      edgeType: codeEdges.edgeType,
      filePath: codeNodes.filePath,
    })
    .from(codeEdges)
    .innerJoin(codeNodes, eq(codeEdges.sourceNodeId, codeNodes.id))
    .where(eq(codeEdges.projectSlug, projectSlug))
    .all();

  const pkgFiles = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (edge.edgeType !== "imports" && edge.edgeType !== "uses_type") continue;
    if (!edge.context) continue;

    const fromMatch = edge.context.match(/from\s+['"]([^'"]+)['"]/);
    if (!fromMatch) continue;

    const fromPath = fromMatch[1]!;
    if (fromPath.startsWith(".") || fromPath.startsWith("/")) continue;

    const parts = fromPath.split("/");
    const pkgName =
      fromPath.startsWith("@") && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]!;

    if (isNodeBuiltin(pkgName)) continue;

    if (!pkgFiles.has(pkgName)) pkgFiles.set(pkgName, new Set());
    pkgFiles.get(pkgName)!.add(edge.filePath);
  }

  const counts = new Map<string, number>();
  for (const [pkg, files] of pkgFiles) {
    counts.set(pkg, files.size);
  }

  return counts;
}

/**
 * Build a project dependencies summary for agent context.
 * Lists top packages by usage count with file counts.
 */
export function buildDependencySummary(projectSlug: string, limit = 15): string | null {
  const counts = getPackageUsageCounts(projectSlug);
  if (counts.size === 0) return null;

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

  const lines = [
    `<codegraph type="dependencies">`,
    `Project uses ${counts.size} external packages:`,
  ];

  for (const [pkg, fileCount] of sorted) {
    lines.push(`  ${pkg} (${fileCount} file${fileCount > 1 ? "s" : ""})`);
  }

  if (counts.size > limit) {
    lines.push(`  ... and ${counts.size - limit} more`);
  }

  lines.push(`</codegraph>`);
  return lines.join("\n");
}

// ─── Node.js Builtins ───────────────────────────────────────────────────

const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
  "node:assert",
  "node:buffer",
  "node:child_process",
  "node:crypto",
  "node:events",
  "node:fs",
  "node:http",
  "node:https",
  "node:net",
  "node:os",
  "node:path",
  "node:process",
  "node:readline",
  "node:stream",
  "node:url",
  "node:util",
  "node:worker_threads",
  "node:zlib",
  "node:test",
  "bun",
  "bun:test",
  "bun:sqlite",
]);

function isNodeBuiltin(name: string): boolean {
  return NODE_BUILTINS.has(name) || name.startsWith("node:");
}
