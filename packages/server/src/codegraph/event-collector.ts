/**
 * CodeGraph Event Collector — taps ws-bridge tool events to detect file mutations,
 * matches them to CodeGraph nodes, and broadcasts graph:activity events.
 *
 * Design: fire-and-forget, NEVER blocks agent thread.
 */

import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { codeNodes } from "../db/schema.js";
import { eq, and, like } from "drizzle-orm";
import { queueNodeDescription } from "./semantic-describer.js";

const log = createLogger("codegraph:events");

// ─── Types ──────────────────────────────────────────────────────────────

export interface GraphActivityEvent {
  sessionId: string;
  filePaths: string[];
  nodeIds: string[];
  toolName: string;
  toolAction: "read" | "modify" | "create";
  timestamp: number;
}

interface TouchRecord {
  count: number;
  lastTouched: number;
  nodeIds: string[];
  toolAction: "read" | "modify" | "create";
}

// ─── Session Activity Tracker ───────────────────────────────────────────

/**
 * Per-session accumulator of graph activity.
 * Tracks which files/nodes the agent has touched and how often.
 */
class SessionActivityTracker {
  /** filePath → touch record */
  private touches = new Map<string, TouchRecord>();
  readonly sessionId: string;
  readonly projectSlug: string;

  constructor(sessionId: string, projectSlug: string) {
    this.sessionId = sessionId;
    this.projectSlug = projectSlug;
  }

  record(filePath: string, nodeIds: string[], toolAction: "read" | "modify" | "create"): void {
    const existing = this.touches.get(filePath);
    if (existing) {
      const actionPriority = { read: 0, create: 1, modify: 2 } as const;
      const bestAction =
        actionPriority[toolAction] > actionPriority[existing.toolAction]
          ? toolAction
          : existing.toolAction;

      this.touches.set(filePath, {
        count: existing.count + 1,
        lastTouched: Date.now(),
        nodeIds: [...new Set([...existing.nodeIds, ...nodeIds])],
        toolAction: bestAction,
      });
    } else {
      this.touches.set(filePath, {
        count: 1,
        lastTouched: Date.now(),
        nodeIds,
        toolAction,
      });
    }
  }

  getHotFiles(
    limit = 10,
  ): Array<{ filePath: string; touchCount: number; nodeIds: string[]; toolAction: string }> {
    return [...this.touches.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([filePath, record]) => ({
        filePath,
        touchCount: record.count,
        nodeIds: record.nodeIds,
        toolAction: record.toolAction,
      }));
  }

  getTotalTouches(): number {
    let total = 0;
    for (const record of this.touches.values()) {
      total += record.count;
    }
    return total;
  }

  getTouchedFileCount(): number {
    return this.touches.size;
  }
}

// ─── Active Trackers ────────────────────────────────────────────────────

const trackers = new Map<string, SessionActivityTracker>();

export function getOrCreateTracker(sessionId: string, projectSlug: string): SessionActivityTracker {
  const existing = trackers.get(sessionId);
  if (existing) return existing;

  const tracker = new SessionActivityTracker(sessionId, projectSlug);
  trackers.set(sessionId, tracker);
  return tracker;
}

export function getTracker(sessionId: string): SessionActivityTracker | undefined {
  return trackers.get(sessionId);
}

export function removeTracker(sessionId: string): void {
  trackers.delete(sessionId);
}

// ─── File Path Extraction ───────────────────────────────────────────────

/**
 * Extract file paths from tool input based on tool name.
 * Handles: Edit, Write, Read, Glob, Grep, MultiEdit, Bash.
 */
export function extractFilePaths(
  toolName: string,
  toolInput: Record<string, unknown>,
): { paths: string[]; action: "read" | "modify" | "create" } {
  switch (toolName) {
    case "Edit":
    case "MultiEdit": {
      const path = (toolInput.file_path ?? toolInput.path ?? "") as string;
      return { paths: path ? [path] : [], action: "modify" };
    }

    case "Write": {
      const path = (toolInput.file_path ?? toolInput.path ?? "") as string;
      return { paths: path ? [path] : [], action: "create" };
    }

    case "Read": {
      const path = (toolInput.file_path ?? toolInput.path ?? "") as string;
      return { paths: path ? [path] : [], action: "read" };
    }

    case "Grep": {
      const path = (toolInput.path ?? "") as string;
      return { paths: path ? [path] : [], action: "read" };
    }

    default:
      return { paths: [], action: "read" };
  }
}

// ─── Path Normalization ─────────────────────────────────────────────────

/**
 * Convert an absolute agent path to a project-relative path.
 * DB stores paths like "packages/server/src/foo.ts" (relative to project root).
 * Agent tool_use provides "D:\Project\Companion\packages\server\src\foo.ts" (absolute).
 */
export function normalizeToRelative(absolutePath: string, projectDir: string): string {
  const fwdAbs = absolutePath.replace(/\\/g, "/");
  const fwdRoot = projectDir.replace(/\\/g, "/").replace(/\/?$/, "/");

  // Strip project root prefix if present (most common case)
  if (fwdAbs.startsWith(fwdRoot)) {
    return fwdAbs.slice(fwdRoot.length);
  }

  // Case-insensitive comparison for Windows drives
  if (fwdAbs.toLowerCase().startsWith(fwdRoot.toLowerCase())) {
    return fwdAbs.slice(fwdRoot.length);
  }

  // Fallback: strip drive letter + try common project folder patterns
  const noDrive = fwdAbs.replace(/^[A-Za-z]:\//, "");
  // Remove leading slash for Unix absolute paths
  return noDrive.replace(/^\//, "");
}

// ─── Node Matching (Batch) ──────────────────────────────────────────────

/**
 * Find CodeGraph node IDs for multiple file paths in a single batch.
 * Uses a single LIKE query per path (no N+1).
 * Returns Map<relativePath, nodeIds[]>.
 */
export function matchNodesToFiles(
  projectSlug: string,
  relativePaths: string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (relativePaths.length === 0) return result;

  try {
    const db = getDb();

    for (const relPath of relativePaths) {
      if (!relPath) continue;

      // Exact match first (single indexed query)
      let nodes = db
        .select({ id: codeNodes.id })
        .from(codeNodes)
        .where(and(eq(codeNodes.projectSlug, projectSlug), eq(codeNodes.filePath, relPath)))
        .all();

      // Fuzzy fallback: suffix match (handles residual path prefix mismatches)
      if (nodes.length === 0 && relPath.includes("/")) {
        nodes = db
          .select({ id: codeNodes.id })
          .from(codeNodes)
          .where(
            and(eq(codeNodes.projectSlug, projectSlug), like(codeNodes.filePath, `%${relPath}`)),
          )
          .all();
      }

      if (nodes.length > 0) {
        result.set(
          relPath,
          nodes.map((n) => String(n.id)),
        );
      }
    }
  } catch (err) {
    log.warn("Failed to match nodes to files", {
      projectSlug,
      paths: relativePaths,
      error: String(err),
    });
  }

  return result;
}

// ─── Main Event Handler ─────────────────────────────────────────────────

/**
 * Process a tool_use event from ws-bridge.
 * Extracts file paths, normalizes to relative, matches to graph nodes, records activity.
 * Returns a GraphActivityEvent if paths were found, null otherwise.
 *
 * MUST be called fire-and-forget (wrapped in try-catch by caller).
 */
export function processToolEvent(
  sessionId: string,
  projectSlug: string,
  projectDir: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): GraphActivityEvent | null {
  const { paths, action } = extractFilePaths(toolName, toolInput);

  if (paths.length === 0) return null;

  // Normalize all paths to project-relative
  const relativePaths = paths.map((p) => normalizeToRelative(p, projectDir));

  // Batch node lookup
  const nodeMap = matchNodesToFiles(projectSlug, relativePaths);

  const tracker = getOrCreateTracker(sessionId, projectSlug);
  const allNodeIds: string[] = [];

  for (const relPath of relativePaths) {
    const nodeIds = nodeMap.get(relPath) ?? [];
    tracker.record(relPath, nodeIds, action);
    allNodeIds.push(...nodeIds);
  }

  // Queue newly discovered nodes for semantic description (Phase 4)
  if (allNodeIds.length > 0) {
    queueNodeDescription(
      projectSlug,
      allNodeIds.map(Number).filter((n) => !isNaN(n)),
    );
  }

  return {
    sessionId,
    filePaths: relativePaths,
    nodeIds: allNodeIds,
    toolName,
    toolAction: action,
    timestamp: Date.now(),
  };
}

// ─── Activity Summary (REST endpoint) ───────────────────────────────────

export function getSessionActivity(sessionId: string) {
  const tracker = trackers.get(sessionId);
  if (!tracker) {
    return {
      sessionId,
      totalTouches: 0,
      touchedFiles: 0,
      hotFiles: [],
    };
  }

  return {
    sessionId,
    totalTouches: tracker.getTotalTouches(),
    touchedFiles: tracker.getTouchedFileCount(),
    hotFiles: tracker.getHotFiles(10),
  };
}
