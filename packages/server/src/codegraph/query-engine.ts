/**
 * CodeGraph query engine — graph traversal utilities for agent context injection.
 */

import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { codeNodes, codeEdges } from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ImpactNode {
  nodeId: number;
  symbolName: string;
  filePath: string;
  symbolType: string;
  description: string | null;
  distance: number;
  cumulativeTrust: number;
}

export interface HotFile {
  filePath: string;
  incomingEdges: number;
  outgoingEdges: number;
  totalTrust: number;
}

export interface CodeNodeWithEdges {
  id: number;
  symbolName: string;
  symbolType: string;
  filePath: string;
  description: string | null;
  signature: string | null;
  isExported: boolean;
  incoming: Array<{ symbolName: string; filePath: string; edgeType: string }>;
  outgoing: Array<{ symbolName: string; filePath: string; edgeType: string }>;
}

// ─── Impact Radius (BFS outgoing) ───────────────────────────────────────

/**
 * BFS from all nodes in filePath, following outgoing edges.
 * Returns nodes sorted by cumulativeTrust DESC.
 */
export function getImpactRadius(
  projectSlug: string,
  filePath: string,
  opts?: { maxDepth?: number; minTrust?: number },
): ImpactNode[] {
  const maxDepth = opts?.maxDepth ?? 2;
  const minTrust = opts?.minTrust ?? 0.3;
  const db = getDb();

  // Get seed nodes (all nodes in the file)
  const seedNodes = db
    .select({ id: codeNodes.id })
    .from(codeNodes)
    .where(and(eq(codeNodes.projectSlug, projectSlug), eq(codeNodes.filePath, filePath)))
    .all();

  if (seedNodes.length === 0) return [];

  const seedIds = new Set(seedNodes.map((n) => n.id));
  const visited = new Map<number, { distance: number; trust: number }>();
  let frontier = seedNodes.map((n) => ({ id: n.id, distance: 0, trust: 1.0 }));

  // Mark seeds as visited
  for (const s of frontier) {
    visited.set(s.id, { distance: 0, trust: 1.0 });
  }

  const MAX_VISITED = 2000;

  // BFS
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (frontier.length === 0 || visited.size >= MAX_VISITED) break;

    const frontierIds = frontier.map((f) => f.id);
    // Get outgoing edges from frontier
    const edges = db
      .select({
        sourceNodeId: codeEdges.sourceNodeId,
        targetNodeId: codeEdges.targetNodeId,
        trustWeight: codeEdges.trustWeight,
      })
      .from(codeEdges)
      .where(
        and(eq(codeEdges.projectSlug, projectSlug), inArray(codeEdges.sourceNodeId, frontierIds)),
      )
      .all();

    const nextFrontier: typeof frontier = [];

    for (const edge of edges) {
      if (seedIds.has(edge.targetNodeId)) continue;

      const parentState = visited.get(edge.sourceNodeId);
      const newTrust = (parentState?.trust ?? 1.0) * edge.trustWeight;

      if (newTrust < minTrust) continue;

      const existing = visited.get(edge.targetNodeId);
      if (!existing || newTrust > existing.trust) {
        visited.set(edge.targetNodeId, { distance: depth, trust: newTrust });
        nextFrontier.push({ id: edge.targetNodeId, distance: depth, trust: newTrust });
      }
    }

    frontier = nextFrontier;
  }

  // Remove seed nodes from results
  for (const id of seedIds) visited.delete(id);

  if (visited.size === 0) return [];

  // Fetch node details
  const resultIds = [...visited.keys()];
  const nodes = db
    .select({
      id: codeNodes.id,
      symbolName: codeNodes.symbolName,
      filePath: codeNodes.filePath,
      symbolType: codeNodes.symbolType,
      description: codeNodes.description,
    })
    .from(codeNodes)
    .where(inArray(codeNodes.id, resultIds))
    .all();

  return nodes
    .map((n) => {
      const state = visited.get(n.id)!;
      return {
        nodeId: n.id,
        symbolName: n.symbolName,
        filePath: n.filePath,
        symbolType: n.symbolType,
        description: n.description,
        distance: state.distance,
        cumulativeTrust: state.trust,
      };
    })
    .sort((a, b) => b.cumulativeTrust - a.cumulativeTrust);
}

// ─── Reverse Dependencies ───────────────────────────────────────────────

/**
 * Follow INCOMING edges to find "who depends on this file".
 */
export function getReverseDependencies(projectSlug: string, filePath: string): ImpactNode[] {
  const db = getDb();

  // Get all nodes in the target file
  const fileNodes = db
    .select({ id: codeNodes.id })
    .from(codeNodes)
    .where(and(eq(codeNodes.projectSlug, projectSlug), eq(codeNodes.filePath, filePath)))
    .all();

  if (fileNodes.length === 0) return [];

  const targetIds = fileNodes.map((n) => n.id);

  // Get incoming edges (who depends on these nodes)
  const edges = db
    .select({
      sourceNodeId: codeEdges.sourceNodeId,
      targetNodeId: codeEdges.targetNodeId,
      trustWeight: codeEdges.trustWeight,
    })
    .from(codeEdges)
    .where(and(eq(codeEdges.projectSlug, projectSlug), inArray(codeEdges.targetNodeId, targetIds)))
    .all();

  if (edges.length === 0) return [];

  // Get unique source node IDs (exclude nodes from same file)
  const targetSet = new Set(targetIds);
  const sourceMap = new Map<number, number>(); // nodeId → max trust
  for (const edge of edges) {
    if (targetSet.has(edge.sourceNodeId)) continue;
    const existing = sourceMap.get(edge.sourceNodeId) ?? 0;
    if (edge.trustWeight > existing) {
      sourceMap.set(edge.sourceNodeId, edge.trustWeight);
    }
  }

  if (sourceMap.size === 0) return [];

  const sourceIds = [...sourceMap.keys()];
  const nodes = db
    .select({
      id: codeNodes.id,
      symbolName: codeNodes.symbolName,
      filePath: codeNodes.filePath,
      symbolType: codeNodes.symbolType,
      description: codeNodes.description,
    })
    .from(codeNodes)
    .where(inArray(codeNodes.id, sourceIds))
    .all();

  return nodes
    .map((n) => ({
      nodeId: n.id,
      symbolName: n.symbolName,
      filePath: n.filePath,
      symbolType: n.symbolType,
      description: n.description,
      distance: 1,
      cumulativeTrust: sourceMap.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.cumulativeTrust - a.cumulativeTrust);
}

// ─── Related Nodes (keyword search) ─────────────────────────────────────

/**
 * Search nodes by symbol name or description keywords.
 * For each match, include top incoming + outgoing edges.
 */
export function getRelatedNodes(
  projectSlug: string,
  keywords: string[],
  limit = 5,
): CodeNodeWithEdges[] {
  if (keywords.length === 0) return [];

  const db = getDb();

  // Search by symbol name (case-insensitive LIKE)
  const matchedNodes: Map<number, typeof codeNodes.$inferSelect> = new Map();

  for (const kw of keywords) {
    if (kw.length < 2) continue;

    const results = db
      .select()
      .from(codeNodes)
      .where(
        and(
          eq(codeNodes.projectSlug, projectSlug),
          sql`(lower(${codeNodes.symbolName}) LIKE lower(${"%" + kw + "%"}) OR lower(${codeNodes.description}) LIKE lower(${"%" + kw + "%"}))`,
        ),
      )
      .limit(10)
      .all();

    for (const r of results) {
      matchedNodes.set(r.id, r);
    }
  }

  // Weighted relevance scoring
  const scored = [...matchedNodes.values()].map((node) => {
    let score = 0;
    const nameLower = node.symbolName.toLowerCase();

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (nameLower === kwLower) {
        score += 1.0; // exact match
      } else if (nameLower.startsWith(kwLower)) {
        score += 0.8; // prefix match
      } else if (nameLower.includes(kwLower)) {
        score += 0.5; // contains match
      } else if (node.description?.toLowerCase().includes(kwLower)) {
        score += 0.3; // description match
      }
    }

    // Bonus for exported symbols
    if (node.isExported) score *= 1.3;
    // Penalty for very short names (likely noise)
    if (node.symbolName.length <= 2) score *= 0.5;

    // Edge connectivity bonus: nodes with more connections are more central
    const edgeCount = db
      .select({ count: sql<number>`count(*)` })
      .from(codeEdges)
      .where(
        sql`${codeEdges.sourceNodeId} = ${node.id} OR ${codeEdges.targetNodeId} = ${node.id}`,
      )
      .get();
    const connections = edgeCount?.count ?? 0;
    if (connections > 0) {
      score += Math.min(0.5, connections * 0.05); // max +0.5 from edges
    }

    return { node, score };
  });

  const sorted = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.node);

  // Enrich with edges
  return sorted.map((node) => {
    const outEdges = db
      .select({
        targetNodeId: codeEdges.targetNodeId,
        edgeType: codeEdges.edgeType,
      })
      .from(codeEdges)
      .where(eq(codeEdges.sourceNodeId, node.id))
      .limit(3)
      .all();

    const inEdges = db
      .select({
        sourceNodeId: codeEdges.sourceNodeId,
        edgeType: codeEdges.edgeType,
      })
      .from(codeEdges)
      .where(eq(codeEdges.targetNodeId, node.id))
      .limit(3)
      .all();

    // Resolve edge node names
    const edgeNodeIds = [
      ...outEdges.map((e) => e.targetNodeId),
      ...inEdges.map((e) => e.sourceNodeId),
    ];

    const edgeNodes =
      edgeNodeIds.length > 0
        ? db
            .select({
              id: codeNodes.id,
              symbolName: codeNodes.symbolName,
              filePath: codeNodes.filePath,
            })
            .from(codeNodes)
            .where(inArray(codeNodes.id, edgeNodeIds))
            .all()
        : [];

    const nodeMap = new Map(edgeNodes.map((n) => [n.id, n]));

    return {
      id: node.id,
      symbolName: node.symbolName,
      symbolType: node.symbolType,
      filePath: node.filePath,
      description: node.description,
      signature: node.signature,
      isExported: node.isExported,
      outgoing: outEdges
        .map((e) => {
          const t = nodeMap.get(e.targetNodeId);
          return t
            ? { symbolName: t.symbolName, filePath: t.filePath, edgeType: e.edgeType }
            : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
      incoming: inEdges
        .map((e) => {
          const s = nodeMap.get(e.sourceNodeId);
          return s
            ? { symbolName: s.symbolName, filePath: s.filePath, edgeType: e.edgeType }
            : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    };
  });
}

// ─── Hot Files ──────────────────────────────────────────────────────────

/**
 * Files with the most edges = highest coupling = most impactful to change.
 */
export function getHotFiles(projectSlug: string, limit = 8): HotFile[] {
  const db = getDb();

  // Count incoming and outgoing edges per file using raw SQL for efficiency
  const results = db.all<{
    filePath: string;
    incoming: number;
    outgoing: number;
    totalTrust: number;
  }>(sql`
    SELECT
      f.file_path as filePath,
      COALESCE(inc.cnt, 0) as incoming,
      COALESCE(out.cnt, 0) as outgoing,
      COALESCE(inc.trust_sum, 0) + COALESCE(out.trust_sum, 0) as totalTrust
    FROM code_files f
    LEFT JOIN (
      SELECT n.file_path, COUNT(*) as cnt, SUM(e.trust_weight) as trust_sum
      FROM code_edges e
      JOIN code_nodes n ON e.target_node_id = n.id AND n.project_slug = ${projectSlug}
      WHERE e.project_slug = ${projectSlug}
      GROUP BY n.file_path
    ) inc ON f.file_path = inc.file_path
    LEFT JOIN (
      SELECT n.file_path, COUNT(*) as cnt, SUM(e.trust_weight) as trust_sum
      FROM code_edges e
      JOIN code_nodes n ON e.source_node_id = n.id AND n.project_slug = ${projectSlug}
      WHERE e.project_slug = ${projectSlug}
      GROUP BY n.file_path
    ) out ON f.file_path = out.file_path
    WHERE f.project_slug = ${projectSlug}
    ORDER BY (COALESCE(inc.cnt, 0) + COALESCE(out.cnt, 0)) DESC
    LIMIT ${limit}
  `);

  return results.map((r) => ({
    filePath: r.filePath,
    incomingEdges: Number(r.incoming),
    outgoingEdges: Number(r.outgoing),
    totalTrust: Number(r.totalTrust),
  }));
}

// ─── Nodes by File ──────────────────────────────────────────────────────

/**
 * Get all exported nodes for a file.
 */
export function getExportedNodesByFile(projectSlug: string, filePath: string) {
  const db = getDb();
  return db
    .select({
      id: codeNodes.id,
      symbolName: codeNodes.symbolName,
      symbolType: codeNodes.symbolType,
      signature: codeNodes.signature,
      description: codeNodes.description,
      isExported: codeNodes.isExported,
    })
    .from(codeNodes)
    .where(
      and(
        eq(codeNodes.projectSlug, projectSlug),
        eq(codeNodes.filePath, filePath),
        eq(codeNodes.isExported, true),
      ),
    )
    .all();
}
