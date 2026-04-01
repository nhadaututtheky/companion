/**
 * CodeGraph agent context provider — 4 injection points for enriching agent messages.
 */

import { createLogger } from "../logger.js";
import { isGraphReady, getProjectStats } from "./index.js";
import { getLatestScanJob } from "./graph-store.js";
import {
  getHotFiles,
  getRelatedNodes,
  getReverseDependencies,
  getExportedNodesByFile,
  type CodeNodeWithEdges as _CodeNodeWithEdges,
} from "./query-engine.js";
import { getPackageUsageCounts } from "./webintel-bridge.js";

const log = createLogger("codegraph-context");

// ─── Keyword Extraction ─────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  // Extract file paths
  const filePaths = extractFilePaths(text);

  // Extract identifiers (camelCase, PascalCase, snake_case)
  const identifiers = text.match(/[a-zA-Z_]\w{2,}/g) ?? [];

  // Filter noise words
  const noise = new Set([
    "the", "this", "that", "with", "from", "into", "have", "been", "will",
    "would", "could", "should", "about", "what", "when", "where", "which",
    "file", "code", "function", "class", "type", "import", "export",
    "create", "update", "delete", "add", "remove", "fix", "change",
    "make", "need", "want", "like", "use", "using", "can", "how",
  ]);

  const keywords = identifiers
    .filter((w) => !noise.has(w.toLowerCase()) && w.length >= 3)
    .slice(0, 10);

  // Add file path basenames as keywords
  for (const fp of filePaths) {
    const base = fp.split("/").pop()?.replace(/\.\w+$/, "");
    if (base && base.length >= 3) keywords.push(base);
  }

  return [...new Set(keywords)];
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Extract file paths from text.
 */
export function extractFilePaths(text: string): string[] {
  const regex = /[\w./\\-]+\.(ts|tsx|js|jsx|py|rs|go|java|cs|sql|vue|svelte)/g;
  const matches = text.match(regex) ?? [];
  return [...new Set(matches)];
}

/**
 * Detect if text contains plan indicators (file lists, "I'll edit", etc.).
 */
export function hasPlanIndicators(text: string): boolean {
  const planPatterns = [
    /files?\s+to\s+(modify|edit|create|change|update)/i,
    /i'll\s+(edit|create|modify|update|change|add)\s/i,
    /plan:/i,
    /implementation\s+plan/i,
    /step\s+\d+[.:]/i,
  ];

  if (planPatterns.some((p) => p.test(text))) return true;

  // Multiple file paths in a list format
  const paths = extractFilePaths(text);
  return paths.length >= 3;
}

// ─── Injection Point A: Project Map ─────────────────────────────────────

/**
 * Build a project map for session start context.
 * Returns null if graph not ready. Max ~1500 tokens.
 */
export function buildProjectMap(projectSlug: string): string | null {
  if (!isGraphReady(projectSlug)) return null;

  try {
    const stats = getProjectStats(projectSlug);
    if (stats.nodes === 0) return null;

    const hotFiles = getHotFiles(projectSlug, 8);
    const lastJob = getLatestScanJob(projectSlug);

    // Detect layers from file paths
    const layers = new Map<string, string[]>();
    for (const hf of hotFiles) {
      const parts = hf.filePath.split("/");
      const layer = (parts.length >= 2 ? parts[parts.length - 2] : undefined) ?? "root";
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer)!.push(hf.filePath.split("/").pop() ?? hf.filePath);
    }

    const lines: string[] = [
      `<codegraph type="project-map">`,
      `Graph: ${stats.files} files, ${stats.nodes} symbols, ${stats.edges} relationships`,
    ];

    if (lastJob?.completedAt) {
      lines.push(`Last scanned: ${lastJob.completedAt}`);
    }

    lines.push("", "Key modules (by coupling):");
    for (const hf of hotFiles) {
      const total = hf.incomingEdges + hf.outgoingEdges;
      lines.push(`  ${hf.filePath} (${total} edges: ${hf.incomingEdges} in, ${hf.outgoingEdges} out)`);
    }

    if (layers.size > 0) {
      lines.push("", "Architecture layers:");
      for (const [layer, files] of layers) {
        lines.push(`  ${layer}/: ${files.join(", ")}`);
      }
    }

    // External dependencies (top 10 by usage)
    try {
      const pkgCounts = getPackageUsageCounts(projectSlug);
      if (pkgCounts.size > 0) {
        const topPkgs = [...pkgCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);
        lines.push("", "Key dependencies:");
        for (const [pkg, count] of topPkgs) {
          lines.push(`  ${pkg} (${count} file${count > 1 ? "s" : ""})`);
        }
      }
    } catch { /* skip */ }

    lines.push(`</codegraph>`);
    return "\n\n" + lines.join("\n");
  } catch (err) {
    log.warn("Failed to build project map", { error: String(err) });
    return null;
  }
}

// ─── Injection Point B: Message Context ─────────────────────────────────

// Simple memoization cache (capped at 200 entries)
const contextCache = new Map<string, { result: string | null; expires: number }>();
const CACHE_MAX_SIZE = 200;

function cacheSet(key: string, value: { result: string | null; expires: number }) {
  if (contextCache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entries (Map preserves insertion order)
    const toDelete = contextCache.size - CACHE_MAX_SIZE + 50;
    let i = 0;
    for (const k of contextCache.keys()) {
      if (i++ >= toDelete) break;
      contextCache.delete(k);
    }
  }
  contextCache.set(key, value);
}

/**
 * Build relevant code context for a user message.
 * Returns null if no relevant nodes found. Max ~800 tokens.
 */
export function buildMessageContext(
  projectSlug: string,
  userMessage: string,
): string | null {
  if (!isGraphReady(projectSlug)) return null;

  const keywords = extractKeywords(userMessage);
  if (keywords.length === 0) return null;

  // Check cache (60s TTL)
  const cacheKey = `${projectSlug}:${keywords.sort().join(",")}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.result;

  try {
    const related = getRelatedNodes(projectSlug, keywords, 5);
    if (related.length === 0) {
      cacheSet(cacheKey, { result: null, expires: Date.now() + 60_000 });
      return null;
    }

    const lines: string[] = [`<codegraph type="context">`];

    for (const node of related) {
      const desc = node.description ? ` — ${node.description}` : "";
      const sig = node.signature ? `${node.signature}` : "";
      lines.push(`[${node.symbolType}] ${node.symbolName}${sig}${desc}`);
      lines.push(`  File: ${node.filePath}`);

      if (node.incoming.length > 0) {
        const deps = node.incoming.map((e) => `${e.symbolName} (${e.filePath})`).join(", ");
        lines.push(`  Used by: ${deps}`);
      }

      if (node.outgoing.length > 0) {
        const uses = node.outgoing.map((e) => `${e.symbolName} (${e.edgeType})`).join(", ");
        lines.push(`  Uses: ${uses}`);
      }
    }

    lines.push(`</codegraph>`);
    const result = "\n\n" + lines.join("\n");

    cacheSet(cacheKey, { result, expires: Date.now() + 60_000 });
    return result;
  } catch (err) {
    log.warn("Failed to build message context", { error: String(err) });
    return null;
  }
}

// ─── Injection Point C: Plan Review ─────────────────────────────────────

/**
 * Review a plan by checking if mentioned files have unmentioned dependencies.
 * Returns null if no gaps found.
 */
export function reviewPlan(
  projectSlug: string,
  mentionedFiles: string[],
): string | null {
  if (!isGraphReady(projectSlug) || mentionedFiles.length === 0) return null;

  try {
    const mentionedSet = new Set(mentionedFiles);
    const missingDeps: Array<{ dependentFile: string; dependsOnFile: string; symbols: string[] }> = [];

    for (const filePath of mentionedFiles) {
      const reverseDeps = getReverseDependencies(projectSlug, filePath);

      // Group by file
      const byFile = new Map<string, string[]>();
      for (const dep of reverseDeps) {
        if (mentionedSet.has(dep.filePath)) continue;
        if (dep.cumulativeTrust < 0.5) continue;

        if (!byFile.has(dep.filePath)) byFile.set(dep.filePath, []);
        byFile.get(dep.filePath)!.push(dep.symbolName);
      }

      for (const [depFile, symbols] of byFile) {
        missingDeps.push({
          dependentFile: depFile,
          dependsOnFile: filePath,
          symbols: symbols.slice(0, 3),
        });
      }
    }

    if (missingDeps.length === 0) return null;

    // Deduplicate by dependent file
    const uniqueDeps = [...new Map(missingDeps.map((d) => [d.dependentFile, d])).values()];

    const lines: string[] = [
      `<codegraph type="plan-review">`,
      `Warning: ${uniqueDeps.length} file(s) depend on files in your plan but aren't included:`,
    ];

    for (const dep of uniqueDeps.slice(0, 5)) {
      lines.push(`  ${dep.dependentFile} — depends on ${dep.dependsOnFile} via ${dep.symbols.join(", ")}`);
    }

    if (uniqueDeps.length > 5) {
      lines.push(`  ... and ${uniqueDeps.length - 5} more`);
    }

    lines.push(`Consider checking these files for breaking changes.`);
    lines.push(`</codegraph>`);
    return "\n\n" + lines.join("\n");
  } catch (err) {
    log.warn("Failed to review plan", { error: String(err) });
    return null;
  }
}

// ─── Injection Point D: Break Check ─────────────────────────────────────

/**
 * Check if modified files have removed exports that other files depend on.
 * Returns null if no breaks detected.
 */
export function checkBreaks(
  projectSlug: string,
  modifiedFiles: string[],
): string | null {
  if (!isGraphReady(projectSlug) || modifiedFiles.length === 0) return null;

  try {
    const breakages: Array<{ file: string; symbol: string; dependents: string[] }> = [];

    for (const filePath of modifiedFiles) {
      // Get current exported nodes from DB (these are the OLD state before rescan)
      const exports = getExportedNodesByFile(projectSlug, filePath);
      if (exports.length === 0) continue;

      // Check reverse deps once per file (not per export)
      const reverseDeps = getReverseDependencies(projectSlug, filePath)
        .filter((d) => d.cumulativeTrust >= 0.5);

      if (reverseDeps.length > 0) {
        const uniqueFiles = [...new Set(reverseDeps.map((d) => d.filePath))].slice(0, 3);
        for (const exp of exports) {
          breakages.push({
            file: filePath,
            symbol: exp.symbolName,
            dependents: uniqueFiles,
          });
        }
      }
    }

    if (breakages.length === 0) return null;

    const lines: string[] = [
      `<codegraph type="break-check">`,
      `Modified files have exports used by other files:`,
    ];

    for (const b of breakages.slice(0, 5)) {
      lines.push(`  ${b.file}::${b.symbol} — used by: ${b.dependents.join(", ")}`);
    }

    lines.push(`Verify these imports still work after your changes.`);
    lines.push(`</codegraph>`);
    return "\n\n" + lines.join("\n");
  } catch (err) {
    log.warn("Failed to check breaks", { error: String(err) });
    return null;
  }
}
