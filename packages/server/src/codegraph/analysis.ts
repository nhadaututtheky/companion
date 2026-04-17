/**
 * CodeGraph Advanced Analysis — FTS5 search, blast radius scoring,
 * execution flow tracing, community detection, RRF search fusion.
 *
 * Ported from code-review-graph patterns, adapted for Companion's
 * Drizzle + SQLite + TypeScript stack.
 */

import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { getSqlite } from "../db/client.js";
import { codeNodes, codeEdges } from "../db/schema.js";
import { leiden } from "./leiden.js";
import { labelCommunities } from "./semantic-describer.js";
import { createLogger } from "../logger.js";

const log = createLogger("codegraph:analysis");

// ── Types ───────────────────────────────────────────────────────────

export interface FtsSearchResult {
  nodeId: number;
  symbolName: string;
  symbolType: string;
  filePath: string;
  description: string | null;
  signature: string | null;
  isExported: boolean;
  rank: number;
  snippet: string;
}

export interface RiskScore {
  nodeId: number;
  symbolName: string;
  filePath: string;
  symbolType: string;
  riskScore: number;
  factors: {
    callerRatio: number;
    crossFileCallers: number;
    testCoverage: number;
    securitySensitivity: number;
    flowParticipation: number;
  };
}

export interface ExecutionFlow {
  entryNodeId: number;
  entryName: string;
  entryFile: string;
  entryType: string;
  depth: number;
  nodeCount: number;
  fileSpread: number;
  nodes: Array<{
    nodeId: number;
    symbolName: string;
    filePath: string;
    depth: number;
  }>;
}

export interface Community {
  id: string;
  label: string;
  files: string[];
  nodeCount: number;
  cohesion: number;
}

export interface FusedSearchResult {
  nodeId: number;
  symbolName: string;
  symbolType: string;
  filePath: string;
  description: string | null;
  isExported: boolean;
  fusedScore: number;
  ftsRank: number | null;
  symbolRank: number | null;
}

// ── Security Keywords (for risk scoring) ────────────────────────────

const SECURITY_KEYWORDS = new Set([
  "auth",
  "login",
  "password",
  "token",
  "session",
  "cookie",
  "jwt",
  "oauth",
  "secret",
  "key",
  "credential",
  "permission",
  "role",
  "admin",
  "root",
  "sudo",
  "encrypt",
  "decrypt",
  "hash",
  "salt",
  "csrf",
  "xss",
  "sql",
  "inject",
  "sanitize",
  "validate",
  "escape",
]);

// ═══════════════════════════════════════════════════════════════════
// 1. FTS5 Full-Text Search
// ═══════════════════════════════════════════════════════════════════

/**
 * Populate FTS5 index from all nodes in a project.
 * Called after a full scan completes.
 */
export function populateFtsIndex(projectSlug: string): void {
  const sqlite = getSqlite();

  // Delete existing FTS entries for this project's nodes
  sqlite.run(
    `
    DELETE FROM code_nodes_fts
    WHERE rowid IN (
      SELECT id FROM code_nodes WHERE project_slug = ?
    )
  `,
    [projectSlug],
  );

  // Re-insert all nodes
  sqlite.run(
    `
    INSERT INTO code_nodes_fts(rowid, symbol_name, description, file_path, body_preview)
    SELECT id, symbol_name, COALESCE(description, ''), file_path, COALESCE(body_preview, '')
    FROM code_nodes
    WHERE project_slug = ?
  `,
    [projectSlug],
  );
}

/**
 * Sync FTS index for specific node IDs (after incremental update).
 */
export function syncFtsForNodes(nodeIds: number[]): void {
  if (nodeIds.length === 0) return;
  const sqlite = getSqlite();

  // Delete old entries
  for (let i = 0; i < nodeIds.length; i += 100) {
    const batch = nodeIds.slice(i, i + 100);
    const placeholders = batch.map(() => "?").join(",");
    sqlite.run(`DELETE FROM code_nodes_fts WHERE rowid IN (${placeholders})`, batch);
  }

  // Re-insert current node data
  for (let i = 0; i < nodeIds.length; i += 100) {
    const batch = nodeIds.slice(i, i + 100);
    const placeholders = batch.map(() => "?").join(",");
    sqlite.run(
      `
      INSERT INTO code_nodes_fts(rowid, symbol_name, description, file_path, body_preview)
      SELECT id, symbol_name, COALESCE(description, ''), file_path, COALESCE(body_preview, '')
      FROM code_nodes
      WHERE id IN (${placeholders})
    `,
      batch,
    );
  }
}

/**
 * Delete FTS entries for nodes being removed (before node deletion).
 */
export function deleteFtsForNodes(nodeIds: number[]): void {
  if (nodeIds.length === 0) return;
  const sqlite = getSqlite();

  for (let i = 0; i < nodeIds.length; i += 100) {
    const batch = nodeIds.slice(i, i + 100);
    const placeholders = batch.map(() => "?").join(",");
    sqlite.run(`DELETE FROM code_nodes_fts WHERE rowid IN (${placeholders})`, batch);
  }
}

/**
 * FTS5 search with ranking and snippet extraction.
 */
export function ftsSearch(projectSlug: string, query: string, limit = 20): FtsSearchResult[] {
  const sqlite = getSqlite();

  // Sanitize query: remove ALL FTS special chars including double quotes
  const terms = query
    .replace(/[{}()[\]^"~*:\\/]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 10) // Cap keyword count to prevent N+1 in fusedSearch
    .map((t) => `"${t}"`)
    .join(" OR ");

  if (!terms) return [];

  const rows = sqlite
    .prepare(
      `
      SELECT
        n.id as nodeId,
        n.symbol_name as symbolName,
        n.symbol_type as symbolType,
        n.file_path as filePath,
        n.description,
        n.signature,
        n.is_exported as isExported,
        fts.rank as rank,
        snippet(code_nodes_fts, -1, '»', '«', '…', 32) as snippet
      FROM code_nodes_fts fts
      JOIN code_nodes n ON n.id = fts.rowid
      WHERE code_nodes_fts MATCH ?
        AND n.project_slug = ?
      ORDER BY fts.rank
      LIMIT ?
    `,
    )
    .all(terms, projectSlug, limit) as FtsSearchResult[];

  return rows.map((r) => ({
    ...r,
    isExported: Boolean(r.isExported),
    rank: Number(r.rank),
  }));
}

// ═══════════════════════════════════════════════════════════════════
// 2. Blast Radius / Risk Scoring
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute risk score for nodes in changed files.
 *
 * risk = callerRatio(0.15) + crossFileCallers(0.15) + testCoverage(0.30)
 *      + securitySensitivity(0.20) + flowParticipation(0.20)
 */
export function computeRiskScores(projectSlug: string, filePaths: string[]): RiskScore[] {
  if (filePaths.length === 0) return [];

  const db = getDb();

  // Get all nodes in the changed files
  const changedNodes = db
    .select()
    .from(codeNodes)
    .where(and(eq(codeNodes.projectSlug, projectSlug), inArray(codeNodes.filePath, filePaths)))
    .all();

  if (changedNodes.length === 0) return [];

  const nodeIds = changedNodes.map((n) => n.id);

  // Get incoming edges for all changed nodes (who calls them)
  const incomingEdges = db
    .select({
      targetNodeId: codeEdges.targetNodeId,
      sourceNodeId: codeEdges.sourceNodeId,
      edgeType: codeEdges.edgeType,
    })
    .from(codeEdges)
    .where(and(eq(codeEdges.projectSlug, projectSlug), inArray(codeEdges.targetNodeId, nodeIds)))
    .all();

  // Build caller map: nodeId → { callerNodeIds, callerFileSet }
  const callerMap = new Map<number, { callers: Set<number>; files: Set<string> }>();
  for (const edge of incomingEdges) {
    let entry = callerMap.get(edge.targetNodeId);
    if (!entry) {
      entry = { callers: new Set(), files: new Set() };
      callerMap.set(edge.targetNodeId, entry);
    }
    entry.callers.add(edge.sourceNodeId);
  }

  // Resolve caller file paths
  const allCallerIds = [...new Set(incomingEdges.map((e) => e.sourceNodeId))];
  if (allCallerIds.length > 0) {
    const callerNodes = db
      .select({ id: codeNodes.id, filePath: codeNodes.filePath })
      .from(codeNodes)
      .where(inArray(codeNodes.id, allCallerIds))
      .all();

    const callerFileMap = new Map(callerNodes.map((n) => [n.id, n.filePath]));

    for (const edge of incomingEdges) {
      const entry = callerMap.get(edge.targetNodeId);
      const callerFile = callerFileMap.get(edge.sourceNodeId);
      if (entry && callerFile) {
        entry.files.add(callerFile);
      }
    }
  }

  // Check for test edges
  const testEdges = db
    .select({ targetNodeId: codeEdges.targetNodeId })
    .from(codeEdges)
    .where(
      and(
        eq(codeEdges.projectSlug, projectSlug),
        inArray(codeEdges.targetNodeId, nodeIds),
        eq(codeEdges.edgeType, "tests"),
      ),
    )
    .all();
  const testedNodeIds = new Set(testEdges.map((e) => e.targetNodeId));

  // Total node count for ratio calculations
  const totalNodesResult = db
    .select({ count: sql<number>`count(*)` })
    .from(codeNodes)
    .where(eq(codeNodes.projectSlug, projectSlug))
    .all();
  const _totalNodes = totalNodesResult[0]?.count ?? 1;

  // Compute scores
  const changedFileSet = new Set(filePaths);
  const results: RiskScore[] = changedNodes.map((node) => {
    const entry = callerMap.get(node.id);
    const callerCount = entry?.callers.size ?? 0;
    const crossFileCallerCount = entry
      ? [...entry.files].filter((f) => !changedFileSet.has(f)).length
      : 0;
    const isTested = testedNodeIds.has(node.id);

    // Check security sensitivity
    const nameLower = node.symbolName.toLowerCase();
    const descLower = (node.description ?? "").toLowerCase();
    const combined = `${nameLower} ${descLower}`;
    const isSecuritySensitive = [...SECURITY_KEYWORDS].some((kw) => combined.includes(kw));

    // Factor calculations (each 0.0–1.0)
    const callerRatio = Math.min(callerCount / 20, 1.0);
    const crossFileFactor = Math.min(crossFileCallerCount * 0.1, 1.0);
    const testCoverage = isTested ? 0.15 : 1.0; // High risk if untested
    const securitySensitivity = isSecuritySensitive ? 1.0 : 0.0;
    // Use cross-file spread as flow participation (distinct from callerRatio)
    const flowParticipation = Math.min((entry?.files.size ?? 0) * 0.15, 1.0);

    // Weighted sum
    const riskScore = Math.min(
      callerRatio * 0.15 +
        crossFileFactor * 0.15 +
        testCoverage * 0.3 +
        securitySensitivity * 0.2 +
        flowParticipation * 0.2,
      1.0,
    );

    return {
      nodeId: node.id,
      symbolName: node.symbolName,
      filePath: node.filePath,
      symbolType: node.symbolType,
      riskScore: Math.round(riskScore * 100) / 100,
      factors: {
        callerRatio: Math.round(callerRatio * 100) / 100,
        crossFileCallers: Math.round(crossFileFactor * 100) / 100,
        testCoverage: Math.round(testCoverage * 100) / 100,
        securitySensitivity: Math.round(securitySensitivity * 100) / 100,
        flowParticipation: Math.round(flowParticipation * 100) / 100,
      },
    };
  });

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

// ═══════════════════════════════════════════════════════════════════
// 3. Execution Flow Tracing
// ═══════════════════════════════════════════════════════════════════

/** Patterns indicating entry points */
const ENTRY_POINT_PATTERNS = [
  /^main$/i,
  /^index$/i,
  /^app$/i,
  /^server$/i,
  /^handler$/i,
  /^test_/i,
  /\.test$/i,
  /\.spec$/i,
];

const ENTRY_POINT_TYPES = new Set(["endpoint", "hook", "component"]);

/**
 * Detect entry points: nodes with no incoming CALLS edges,
 * or nodes matching entry-point patterns/types.
 */
export function traceExecutionFlows(
  projectSlug: string,
  opts?: { maxDepth?: number; maxFlows?: number },
): ExecutionFlow[] {
  const maxDepth = opts?.maxDepth ?? 15;
  const maxFlows = opts?.maxFlows ?? 30;
  const db = getDb();

  // Get all nodes
  const allNodes = db
    .select({
      id: codeNodes.id,
      symbolName: codeNodes.symbolName,
      filePath: codeNodes.filePath,
      symbolType: codeNodes.symbolType,
    })
    .from(codeNodes)
    .where(eq(codeNodes.projectSlug, projectSlug))
    .all();

  if (allNodes.length === 0) return [];

  // Get all CALLS edges
  const callEdges = db
    .select({
      sourceNodeId: codeEdges.sourceNodeId,
      targetNodeId: codeEdges.targetNodeId,
    })
    .from(codeEdges)
    .where(and(eq(codeEdges.projectSlug, projectSlug), eq(codeEdges.edgeType, "calls")))
    .all();

  // Build adjacency list
  const outgoing = new Map<number, number[]>();
  const hasIncoming = new Set<number>();

  for (const edge of callEdges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
    hasIncoming.add(edge.targetNodeId);
  }

  // Find entry points
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const entryPoints: number[] = [];

  for (const node of allNodes) {
    const isEntry =
      ENTRY_POINT_TYPES.has(node.symbolType) ||
      ENTRY_POINT_PATTERNS.some((p) => p.test(node.symbolName)) ||
      (!hasIncoming.has(node.id) && outgoing.has(node.id));

    if (isEntry) entryPoints.push(node.id);
  }

  // BFS from each entry point
  const flows: ExecutionFlow[] = [];

  for (const entryId of entryPoints.slice(0, maxFlows)) {
    const entry = nodeMap.get(entryId);
    if (!entry) continue;

    const visited = new Set<number>();
    const flowNodes: ExecutionFlow["nodes"] = [];
    let frontier = [{ id: entryId, depth: 0 }];
    visited.add(entryId);
    flowNodes.push({
      nodeId: entryId,
      symbolName: entry.symbolName,
      filePath: entry.filePath,
      depth: 0,
    });

    let currentDepth = 0;

    while (frontier.length > 0 && currentDepth < maxDepth) {
      currentDepth++;
      const nextFrontier: typeof frontier = [];

      for (const { id } of frontier) {
        const targets = outgoing.get(id) ?? [];
        for (const targetId of targets) {
          if (visited.has(targetId)) continue;
          visited.add(targetId);

          const target = nodeMap.get(targetId);
          if (target) {
            flowNodes.push({
              nodeId: targetId,
              symbolName: target.symbolName,
              filePath: target.filePath,
              depth: currentDepth,
            });
            nextFrontier.push({ id: targetId, depth: currentDepth });
          }
        }
      }

      frontier = nextFrontier;
    }

    // Only include flows with >1 node (non-trivial)
    if (flowNodes.length > 1) {
      const uniqueFiles = new Set(flowNodes.map((n) => n.filePath));
      flows.push({
        entryNodeId: entryId,
        entryName: entry.symbolName,
        entryFile: entry.filePath,
        entryType: entry.symbolType,
        depth: Math.max(...flowNodes.map((n) => n.depth)),
        nodeCount: flowNodes.length,
        fileSpread: uniqueFiles.size,
        nodes: flowNodes,
      });
    }
  }

  // Sort by file spread × node count (most impactful flows first)
  return flows.sort((a, b) => b.fileSpread * b.nodeCount - a.fileSpread * a.nodeCount);
}

// ═══════════════════════════════════════════════════════════════════
// 4. Community Detection (Leiden algorithm + path-based fallback)
// ═══════════════════════════════════════════════════════════════════

// Cache: projectSlug → { result, timestamp }
const communityCache = new Map<string, { result: Community[]; timestamp: number }>();
const COMMUNITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Invalidate community cache for a project (call after rescan). */
export function invalidateCommunityCache(projectSlug: string): void {
  communityCache.delete(projectSlug);
}

/**
 * Detect communities using Leiden algorithm on the code graph.
 * Falls back to path-based grouping when graph has <10 nodes.
 * Results are cached for 5 minutes.
 */
export function detectCommunities(projectSlug: string): Community[] {
  // Check cache
  const cached = communityCache.get(projectSlug);
  if (cached && Date.now() - cached.timestamp < COMMUNITY_CACHE_TTL) {
    return cached.result;
  }

  const db = getDb();

  // Get all nodes
  const allNodes = db
    .select({ id: codeNodes.id, filePath: codeNodes.filePath, symbolName: codeNodes.symbolName })
    .from(codeNodes)
    .where(eq(codeNodes.projectSlug, projectSlug))
    .all();

  if (allNodes.length === 0) return [];

  // Get all edges with trust weights
  const allEdges = db
    .select({
      sourceNodeId: codeEdges.sourceNodeId,
      targetNodeId: codeEdges.targetNodeId,
      trustWeight: codeEdges.trustWeight,
    })
    .from(codeEdges)
    .where(eq(codeEdges.projectSlug, projectSlug))
    .all();

  // Fallback to path-based for sparse graphs
  if (allNodes.length < 10 || allEdges.length < 5) {
    const result = detectCommunitiesByPath(allNodes, allEdges);
    communityCache.set(projectSlug, { result, timestamp: Date.now() });
    return result;
  }

  // Run Leiden
  const nodeIds = allNodes.map((n) => n.id);
  const leidenEdges = allEdges.map((e) => ({
    source: e.sourceNodeId,
    target: e.targetNodeId,
    weight: e.trustWeight,
  }));

  const leidenResult = leiden(nodeIds, leidenEdges, { resolution: 1.0, maxIterations: 10 });

  log.info("Leiden completed", {
    projectSlug,
    nodes: nodeIds.length,
    edges: allEdges.length,
    communities: leidenResult.communities.length,
    modularity: leidenResult.modularity,
    iterations: leidenResult.iterations,
  });

  // Build node lookup
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  // Convert Leiden results to Community interface
  const communities: Community[] = leidenResult.communities
    .filter((c) => c.members.length >= 2) // skip singleton communities
    .map((c) => {
      // Collect unique files in this community
      const files = [
        ...new Set(
          c.members.map((id) => nodeMap.get(id)?.filePath).filter((f): f is string => !!f),
        ),
      ];

      // Generate label from most common path prefix
      const label = inferCommunityLabel(files, c.members, nodeMap);

      return {
        id: `leiden-${c.id}`,
        label,
        files,
        nodeCount: c.members.length,
        cohesion: c.cohesion,
      };
    });

  const sorted = communities.sort((a, b) => b.nodeCount - a.nodeCount);
  communityCache.set(projectSlug, { result: sorted, timestamp: Date.now() });
  return sorted;
}

// Label cache: communityId → AI label
const aiLabelCache = new Map<string, string>();

/**
 * Enrich communities with AI-generated labels (async).
 * Uses Haiku to generate descriptive names like "Authentication & Sessions".
 * Results are cached — call after detectCommunities().
 */
export async function enrichCommunitiesWithAILabels(projectSlug: string): Promise<Community[]> {
  const communities = detectCommunities(projectSlug);
  if (communities.length === 0) return communities;

  // Find communities without AI labels
  const needLabeling = communities.filter((c) => !aiLabelCache.has(c.id));

  if (needLabeling.length > 0) {
    const db = getDb();

    // Get top symbols per community for context
    const inputs = needLabeling.map((c) => {
      // Get symbol names for members in this community's files
      const symbols = db
        .select({ symbolName: codeNodes.symbolName })
        .from(codeNodes)
        .where(
          and(
            eq(codeNodes.projectSlug, projectSlug),
            inArray(codeNodes.filePath, c.files.slice(0, 10)),
            eq(codeNodes.isExported, true),
          ),
        )
        .limit(10)
        .all()
        .map((n) => n.symbolName);

      return {
        communityId: c.id,
        files: c.files,
        topSymbols: symbols,
        nodeCount: c.nodeCount,
      };
    });

    try {
      const labels = await labelCommunities(inputs);
      for (const [id, label] of labels) {
        aiLabelCache.set(id, label);
      }
    } catch {
      log.debug("AI community labeling failed, using inferred labels");
    }
  }

  // Apply cached AI labels
  return communities.map((c) => {
    const aiLabel = aiLabelCache.get(c.id);
    return aiLabel ? { ...c, label: aiLabel } : c;
  });
}

/**
 * Infer a human-readable label for a community from its files and symbols.
 * Uses common path prefix + top symbol names.
 */
function inferCommunityLabel(
  files: string[],
  memberIds: number[],
  nodeMap: Map<number, { id: number; filePath: string; symbolName: string }>,
): string {
  if (files.length === 0) return "Unknown";

  // Find common path prefix
  const parts = files.map((f) => f.replace(/\\/g, "/").split("/"));
  let commonDepth = 0;

  if (parts.length > 0) {
    for (let i = 0; i < (parts[0]?.length ?? 0) - 1; i++) {
      const segment = parts[0]![i];
      if (parts.every((p) => p[i] === segment)) {
        commonDepth = i + 1;
      } else {
        break;
      }
    }
  }

  const prefix =
    commonDepth > 0
      ? parts[0]!.slice(0, Math.min(commonDepth + 1, 3)).join("/")
      : files[0]!.replace(/\\/g, "/").split("/").slice(0, 2).join("/");

  // Add top symbol hint if community has a clear focus
  const symbols = memberIds
    .map((id) => nodeMap.get(id)?.symbolName)
    .filter((s): s is string => !!s);

  if (symbols.length <= 3) {
    return `${prefix} (${symbols.join(", ")})`;
  }

  return prefix;
}

/**
 * Path-based fallback for sparse graphs (<10 nodes).
 * Groups by top-level directory segments.
 */
function detectCommunitiesByPath(
  allNodes: Array<{ id: number; filePath: string; symbolName: string }>,
  allEdges: Array<{ sourceNodeId: number; targetNodeId: number; trustWeight: number }>,
): Community[] {
  const nodeToFile = new Map(allNodes.map((n) => [n.id, n.filePath]));
  const fileNodeCounts = new Map<string, number>();
  for (const n of allNodes) {
    fileNodeCounts.set(n.filePath, (fileNodeCounts.get(n.filePath) ?? 0) + 1);
  }

  const communityMap = new Map<string, { files: string[]; nodeCount: number }>();
  for (const [filePath, count] of fileNodeCounts) {
    const parts = filePath.replace(/\\/g, "/").split("/");
    const key =
      parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts.length >= 2 ? parts[0]! : "root";
    const entry = communityMap.get(key) ?? { files: [], nodeCount: 0 };
    entry.files.push(filePath);
    entry.nodeCount += count;
    communityMap.set(key, entry);
  }

  const fileToCommunity = new Map<string, string>();
  for (const [key, entry] of communityMap) {
    for (const f of entry.files) fileToCommunity.set(f, key);
  }

  const internalEdges = new Map<string, number>();
  const externalEdges = new Map<string, number>();
  for (const edge of allEdges) {
    const sf = nodeToFile.get(edge.sourceNodeId);
    const tf = nodeToFile.get(edge.targetNodeId);
    if (!sf || !tf) continue;
    const sc = fileToCommunity.get(sf);
    const tc = fileToCommunity.get(tf);
    if (!sc) continue;
    if (sc === tc) {
      internalEdges.set(sc, (internalEdges.get(sc) ?? 0) + 1);
    } else {
      externalEdges.set(sc, (externalEdges.get(sc) ?? 0) + 1);
    }
  }

  const communities: Community[] = [];
  for (const [key, entry] of communityMap) {
    const internal = internalEdges.get(key) ?? 0;
    const external = externalEdges.get(key) ?? 0;
    const total = internal + external;
    communities.push({
      id: key.replace(/\//g, "--").replace(/[^a-zA-Z0-9-_]/g, "-"),
      label: key,
      files: entry.files,
      nodeCount: entry.nodeCount,
      cohesion: total > 0 ? Math.round((internal / total) * 100) / 100 : 0,
    });
  }

  return communities.sort((a, b) => b.nodeCount - a.nodeCount);
}

// ═══════════════════════════════════════════════════════════════════
// 5. RRF Search Fusion
// ═══════════════════════════════════════════════════════════════════

const RRF_K = 60; // Standard RRF constant

/**
 * Reciprocal Rank Fusion — merge FTS5 and symbol-name search results.
 * Score = 1/(k + rank_fts + 1) + 1/(k + rank_symbol + 1)
 */
export function fusedSearch(projectSlug: string, query: string, limit = 15): FusedSearchResult[] {
  // Run both searches
  const ftsResults = ftsSearch(projectSlug, query, limit * 2);

  // Symbol name search (existing LIKE-based)
  const db = getDb();
  const keywords = query
    .split(/\s+/)
    .filter((k) => k.length >= 2)
    .slice(0, 10);
  const symbolResults: Array<{ id: number; score: number }> = [];

  for (const kw of keywords) {
    const matches = db
      .select({
        id: codeNodes.id,
        symbolName: codeNodes.symbolName,
        isExported: codeNodes.isExported,
      })
      .from(codeNodes)
      .where(
        and(
          eq(codeNodes.projectSlug, projectSlug),
          sql`lower(${codeNodes.symbolName}) LIKE lower(${"%" + kw + "%"})`,
        ),
      )
      .limit(limit * 2)
      .all();

    for (const m of matches) {
      const nameLower = m.symbolName.toLowerCase();
      const kwLower = kw.toLowerCase();
      let score = 0.5;
      if (nameLower === kwLower) score = 1.0;
      else if (nameLower.startsWith(kwLower)) score = 0.8;
      if (m.isExported) score *= 1.3;

      const existing = symbolResults.find((r) => r.id === m.id);
      if (existing) {
        existing.score = Math.max(existing.score, score);
      } else {
        symbolResults.push({ id: m.id, score });
      }
    }
  }

  symbolResults.sort((a, b) => b.score - a.score);

  // RRF fusion
  const fusedScores = new Map<
    number,
    { ftsRank: number | null; symbolRank: number | null; score: number }
  >();

  // FTS rankings
  for (let i = 0; i < ftsResults.length; i++) {
    const nodeId = ftsResults[i]!.nodeId;
    const rrfScore = 1 / (RRF_K + i + 1);
    fusedScores.set(nodeId, {
      ftsRank: i + 1,
      symbolRank: null,
      score: rrfScore,
    });
  }

  // Symbol rankings
  for (let i = 0; i < symbolResults.length; i++) {
    const nodeId = symbolResults[i]!.id;
    const rrfScore = 1 / (RRF_K + i + 1);
    const existing = fusedScores.get(nodeId);
    if (existing) {
      existing.symbolRank = i + 1;
      existing.score += rrfScore;
    } else {
      fusedScores.set(nodeId, {
        ftsRank: null,
        symbolRank: i + 1,
        score: rrfScore,
      });
    }
  }

  // Sort by fused score and fetch node details
  const sorted = [...fusedScores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);

  if (sorted.length === 0) return [];

  const nodeIds = sorted.map(([id]) => id);
  const nodes = db
    .select({
      id: codeNodes.id,
      symbolName: codeNodes.symbolName,
      symbolType: codeNodes.symbolType,
      filePath: codeNodes.filePath,
      description: codeNodes.description,
      isExported: codeNodes.isExported,
    })
    .from(codeNodes)
    .where(inArray(codeNodes.id, nodeIds))
    .all();

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return sorted
    .map(([id, scores]) => {
      const node = nodeMap.get(id);
      if (!node) return null;
      return {
        nodeId: id,
        symbolName: node.symbolName,
        symbolType: node.symbolType,
        filePath: node.filePath,
        description: node.description,
        isExported: node.isExported,
        fusedScore: Math.round(scores.score * 10000) / 10000,
        ftsRank: scores.ftsRank,
        symbolRank: scores.symbolRank,
      };
    })
    .filter((r): r is FusedSearchResult => r !== null);
}
