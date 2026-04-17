/**
 * CodeGraph agent context provider — 4 injection points for enriching agent messages.
 */

import { eq } from "drizzle-orm";
import { createLogger } from "../logger.js";
import type { TaskClassification } from "@companion/shared/types";
import { isGraphReady, getProjectStats } from "./index.js";
import { getLatestScanJob } from "./graph-store.js";
import { getTracker } from "./event-collector.js";
import {
  getHotFiles,
  getRelatedNodes,
  getReverseDependencies,
  getExportedNodesByFile,
  type CodeNodeWithEdges as _CodeNodeWithEdges,
} from "./query-engine.js";
import { detectCommunities } from "./analysis.js";
import { getPackageUsageCounts } from "./webintel-bridge.js";
import { getDb } from "../db/client.js";
import { codegraphConfig } from "../db/schema.js";

const log = createLogger("codegraph-context");

// ─── Config ─────────────────────────────────────────────────────────────

export interface CodeGraphConfig {
  injectionEnabled: boolean;
  projectMapEnabled: boolean;
  messageContextEnabled: boolean;
  planReviewEnabled: boolean;
  breakCheckEnabled: boolean;
  webDocsEnabled: boolean;
  activityFeedEnabled: boolean;
  excludePatterns: string[];
  maxContextTokens: number;
}

const DEFAULT_CONFIG: CodeGraphConfig = {
  injectionEnabled: true,
  projectMapEnabled: true,
  messageContextEnabled: true,
  planReviewEnabled: true,
  breakCheckEnabled: true,
  webDocsEnabled: true,
  activityFeedEnabled: true,
  excludePatterns: [],
  maxContextTokens: 800,
};

/** Get codegraph injection config for a project. Returns defaults if none set. */
export function getCodeGraphConfig(projectSlug: string): CodeGraphConfig {
  try {
    const db = getDb();
    const row = db
      .select()
      .from(codegraphConfig)
      .where(eq(codegraphConfig.projectSlug, projectSlug))
      .get();
    if (!row) return DEFAULT_CONFIG;
    return {
      injectionEnabled: row.injectionEnabled,
      projectMapEnabled: row.projectMapEnabled,
      messageContextEnabled: row.messageContextEnabled,
      planReviewEnabled: row.planReviewEnabled,
      breakCheckEnabled: row.breakCheckEnabled,
      webDocsEnabled: row.webDocsEnabled,
      activityFeedEnabled:
        ((row as Record<string, unknown>).activityFeedEnabled as boolean) ?? true,
      excludePatterns: (row.excludePatterns as string[]) ?? [],
      maxContextTokens: row.maxContextTokens,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ─── Keyword Extraction ─────────────────────────────────────────────────

const STOP_WORDS = new Set([
  // English
  "the",
  "this",
  "that",
  "with",
  "from",
  "into",
  "have",
  "been",
  "will",
  "would",
  "could",
  "should",
  "about",
  "what",
  "when",
  "where",
  "which",
  "file",
  "code",
  "function",
  "class",
  "type",
  "import",
  "export",
  "create",
  "update",
  "delete",
  "add",
  "remove",
  "fix",
  "change",
  "make",
  "need",
  "want",
  "like",
  "use",
  "using",
  "can",
  "how",
  "please",
  "just",
  "also",
  "then",
  "some",
  "more",
  "check",
  "look",
  "see",
  "try",
  // Vietnamese
  "cái",
  "này",
  "của",
  "cho",
  "các",
  "được",
  "trong",
  "với",
  "không",
  "đã",
  "sẽ",
  "bro",
  "nhé",
  "luôn",
  "rồi",
  "thì",
  "mà",
  "hay",
]);

/** Split camelCase/PascalCase into constituent words */
function splitCamelCase(word: string): string[] {
  return word
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function extractKeywords(text: string): string[] {
  // Extract file paths first
  const filePaths = extractFilePaths(text);

  // Extract identifiers (camelCase, PascalCase, snake_case, kebab-case)
  const identifiers = text.match(/[a-zA-Z_][\w-]{2,}/g) ?? [];

  const keywords: string[] = [];

  for (const word of identifiers) {
    const lower = word.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    if (word.length < 3) continue;

    keywords.push(word);

    // Also add camelCase parts as individual keywords
    if (/[A-Z]/.test(word) && word.length > 6) {
      for (const part of splitCamelCase(word)) {
        if (!STOP_WORDS.has(part)) keywords.push(part);
      }
    }
  }

  // Add file path basenames as high-value keywords
  for (const fp of filePaths) {
    const base = fp
      .split("/")
      .pop()
      ?.replace(/\.\w+$/, "");
    if (base && base.length >= 3) keywords.push(base);
    // Also add parent directory name (domain indicator)
    const parts = fp.split("/");
    if (parts.length >= 2) {
      const dir = parts[parts.length - 2];
      if (dir && dir.length >= 3 && !STOP_WORDS.has(dir)) keywords.push(dir);
    }
  }

  return [...new Set(keywords)].slice(0, 15);
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
      lines.push(
        `  ${hf.filePath} (${total} edges: ${hf.incomingEdges} in, ${hf.outgoingEdges} out)`,
      );
    }

    if (layers.size > 0) {
      lines.push("", "Architecture layers:");
      for (const [layer, files] of layers) {
        lines.push(`  ${layer}/: ${files.join(", ")}`);
      }
    }

    // Functional communities (clusters of related code)
    try {
      const communities = detectCommunities(projectSlug);
      const topCommunities = communities.filter((c) => c.nodeCount >= 3).slice(0, 8);
      if (topCommunities.length > 0) {
        lines.push("", "Functional clusters:");
        for (const c of topCommunities) {
          lines.push(
            `  ${c.label} (${c.nodeCount} symbols, cohesion: ${(c.cohesion * 100).toFixed(0)}%)`,
          );
        }
      }
    } catch {
      /* skip */
    }

    // External dependencies (top 10 by usage)
    try {
      const pkgCounts = getPackageUsageCounts(projectSlug);
      if (pkgCounts.size > 0) {
        const topPkgs = [...pkgCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        lines.push("", "Key dependencies:");
        for (const [pkg, count] of topPkgs) {
          lines.push(`  ${pkg} (${count} file${count > 1 ? "s" : ""})`);
        }
      }
    } catch {
      /* skip */
    }

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
 * Returns null if no relevant nodes found.
 *
 * When classification is provided, adjusts result count and focus:
 * - simple tasks: max 3 symbols (less noise)
 * - complex tasks: max 8 symbols (broader view)
 * - review tasks: include reverse dependencies
 */
export function buildMessageContext(
  projectSlug: string,
  userMessage: string,
  classification?: TaskClassification,
): string | null {
  if (!isGraphReady(projectSlug)) return null;

  // Merge keywords from message + classification's relevant files
  const messageKeywords = extractKeywords(userMessage);
  const classificationFiles = classification?.relevantFiles ?? [];
  const fileKeywords = classificationFiles.flatMap((fp) => {
    const base = fp
      .split("/")
      .pop()
      ?.replace(/\.\w+$/, "");
    return base && base.length >= 3 ? [base] : [];
  });
  const keywords = [...new Set([...messageKeywords, ...fileKeywords])];
  if (keywords.length === 0) return null;

  // Adjust result count by task complexity
  const resultLimit =
    classification?.complexity === "simple" ? 3 : classification?.complexity === "complex" ? 8 : 5;

  // Check cache (60s TTL)
  const cacheKey = `${projectSlug}:${keywords.sort().join(",")}:${resultLimit}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.result;

  try {
    const related = getRelatedNodes(projectSlug, keywords, resultLimit);
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
export function reviewPlan(projectSlug: string, mentionedFiles: string[]): string | null {
  if (!isGraphReady(projectSlug) || mentionedFiles.length === 0) return null;

  try {
    const mentionedSet = new Set(mentionedFiles);
    const missingDeps: Array<{ dependentFile: string; dependsOnFile: string; symbols: string[] }> =
      [];

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
      lines.push(
        `  ${dep.dependentFile} — depends on ${dep.dependsOnFile} via ${dep.symbols.join(", ")}`,
      );
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

// ─── Injection Point E: Activity Feed ──────────────────────────────────

/** Tracks the last injection timestamp per session (inject every 3rd turn or on change) */
const activityInjectionState = new Map<
  string,
  { lastInjectedTurn: number; lastHotNodesHash: string }
>();

/**
 * Build activity context for agent self-awareness.
 * Returns compact XML block (~150-200 tokens) with agent's own footprint.
 * Returns null if no activity, disabled, or too frequent.
 */
export function buildActivityContext(
  sessionId: string,
  projectSlug: string,
  currentTurn: number,
  contextUsedPercent: number,
): string | null {
  // Adaptive sizing: skip if context is getting full
  if (contextUsedPercent > 70) {
    log.info("Skipping activity feed — context full", { contextUsedPercent });
    return null;
  }

  try {
    const tracker = getTracker(sessionId);
    if (!tracker) return null;

    const hotFiles = tracker.getHotFiles(5);
    if (hotFiles.length === 0) return null;

    // Rate limit: inject every 3rd turn or when hot nodes changed
    const hotHash = hotFiles.map((f) => `${f.filePath}:${f.touchCount}`).join("|");
    const prev = activityInjectionState.get(sessionId);
    if (prev) {
      const turnsSinceLast = currentTurn - prev.lastInjectedTurn;
      if (turnsSinceLast < 3 && prev.lastHotNodesHash === hotHash) {
        return null; // No change and too frequent
      }
    }

    activityInjectionState.set(sessionId, {
      lastInjectedTurn: currentTurn,
      lastHotNodesHash: hotHash,
    });

    const totalTouches = tracker.getTotalTouches();
    const touchedFiles = tracker.getTouchedFileCount();

    // Build compact XML
    const lines: string[] = [
      `<graph_activity session="${sessionId.slice(0, 8)}" turn="${currentTurn}">`,
      `  <hot_nodes>`,
    ];

    for (const file of hotFiles) {
      const impact = file.touchCount >= 3 ? "high" : file.touchCount >= 2 ? "medium" : "low";
      lines.push(
        `    <node file="${file.filePath}" touches="${file.touchCount}" impact="${impact}" />`,
      );
    }

    lines.push(`  </hot_nodes>`);
    lines.push(`  <summary touched_files="${touchedFiles}" total_edits="${totalTouches}" />`);

    // Add hint for high-touch files
    const highTouchFiles = hotFiles.filter((f) => f.touchCount >= 3);
    if (highTouchFiles.length > 0) {
      lines.push(
        `  <hint>Files touched 3+ times: consider if the root cause is upstream of ${highTouchFiles[0]!.filePath}</hint>`,
      );
    }

    lines.push(`</graph_activity>`);
    return "\n\n" + lines.join("\n");
  } catch (err) {
    log.warn("Failed to build activity context", { error: String(err) });
    return null;
  }
}

/** Clean up activity injection state when session ends */
export function clearActivityState(sessionId: string): void {
  activityInjectionState.delete(sessionId);
}

// ─── Adaptive Context Sizing ──────────────────────────────────────────

/**
 * Determine which injection types should be skipped based on context usage.
 * Returns a set of injection types to skip.
 */
export function getSkippedInjections(contextUsedPercent: number): Set<string> {
  const skip = new Set<string>();

  if (contextUsedPercent > 95) {
    // Emergency: skip everything except break_check (safety-critical)
    skip.add("project_map");
    skip.add("message_context");
    skip.add("plan_review");
    skip.add("activity_feed");
    skip.add("web_docs");
  } else if (contextUsedPercent > 85) {
    // High: skip non-critical
    skip.add("activity_feed");
    skip.add("web_docs");
  } else if (contextUsedPercent > 70) {
    // Moderate: skip activity feed only
    skip.add("activity_feed");
  }

  return skip;
}

// ─── Injection Point D: Break Check ─────────────────────────────────────

/**
 * Check if modified files have exports used by other files.
 * Enhanced: includes signature info so agents can detect parameter changes.
 * Returns null if no breaks detected.
 */
export function checkBreaks(projectSlug: string, modifiedFiles: string[]): string | null {
  if (!isGraphReady(projectSlug) || modifiedFiles.length === 0) return null;

  try {
    const breakages: Array<{
      file: string;
      symbol: string;
      signature: string | null;
      symbolType: string;
      dependentCount: number;
      dependents: string[];
    }> = [];

    for (const filePath of modifiedFiles) {
      const exports = getExportedNodesByFile(projectSlug, filePath);
      if (exports.length === 0) continue;

      const reverseDeps = getReverseDependencies(projectSlug, filePath).filter(
        (d) => d.cumulativeTrust >= 0.5,
      );

      if (reverseDeps.length > 0) {
        const uniqueFiles = [...new Set(reverseDeps.map((d) => d.filePath))];
        for (const exp of exports) {
          breakages.push({
            file: filePath,
            symbol: exp.symbolName,
            signature: exp.signature ?? null,
            symbolType: exp.symbolType,
            dependentCount: uniqueFiles.length,
            dependents: uniqueFiles.slice(0, 3),
          });
        }
      }
    }

    if (breakages.length === 0) return null;

    // Sort by dependent count (highest risk first)
    breakages.sort((a, b) => b.dependentCount - a.dependentCount);

    const lines: string[] = [
      `<codegraph type="break-check">`,
      `Modified files have exports used by other files (${breakages.length} exports at risk):`,
    ];

    for (const b of breakages.slice(0, 8)) {
      const sig = b.signature ? ` ${b.signature}` : "";
      const risk = b.dependentCount >= 5 ? " HIGH-RISK" : b.dependentCount >= 3 ? " MEDIUM" : "";
      lines.push(
        `  [${b.symbolType}] ${b.file}::${b.symbol}${sig} — ${b.dependentCount} dependents: ${b.dependents.join(", ")}${risk}`,
      );
    }

    if (breakages.length > 8) {
      lines.push(`  ... and ${breakages.length - 8} more`);
    }

    lines.push(
      `If you changed function signatures (params, return type), verify all dependents still compile.`,
    );
    lines.push(`</codegraph>`);
    return "\n\n" + lines.join("\n");
  } catch (err) {
    log.warn("Failed to check breaks", { error: String(err) });
    return null;
  }
}
