/**
 * CodeGraph Diagram Generator — produces Mermaid diagram strings
 * from code graph data for architecture visualization.
 */

import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { codeNodes, codeEdges } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { detectCommunities, traceExecutionFlows, type Community } from "./analysis.js";
import { getProjectNodes, getProjectEdges, findNodesByName } from "./graph-store.js";

const log = createLogger("codegraph:diagram");

// ─── Types ──────────────────────────────────────────────────────────────

export interface DiagramResult {
  mermaid: string;
  type: "architecture" | "module" | "flow";
  description: string;
  nodeCount: number;
  edgeCount: number;
}

// ─── Sanitization ───────────────────────────────────────────────────────

/** Sanitize a string for safe use in Mermaid syntax */
function sanitize(s: string): string {
  return s.replace(/["\[\](){}|<>]/g, "").replace(/\s+/g, " ").trim();
}

/** Create a short, readable ID for Mermaid nodes */
function mermaidId(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

/** Shorten file path for display */
function shortPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 2) return filePath;
  return `.../${parts.slice(-2).join("/")}`;
}

// ─── Architecture Diagram ───────────────────────────────────────────────

/**
 * High-level architecture diagram — communities as subgraphs,
 * cross-cluster edges shown as arrows between clusters.
 */
export function generateArchitectureDiagram(projectSlug: string): DiagramResult {
  const communities = detectCommunities(projectSlug);
  const allEdges = getProjectEdges(projectSlug);
  const allNodes = getProjectNodes(projectSlug);

  if (communities.length === 0) {
    return {
      mermaid: "flowchart TD\n  empty[\"No communities detected — run a full scan first\"]",
      type: "architecture",
      description: "No graph data available",
      nodeCount: 0,
      edgeCount: 0,
    };
  }

  // Build node → community mapping
  const nodeToFile = new Map<number, string>();
  for (const node of allNodes) nodeToFile.set(node.id, node.filePath);

  const fileToCommunity = new Map<string, string>();
  for (const c of communities) {
    for (const f of c.files) fileToCommunity.set(f, c.id);
  }

  // Count cross-community edges
  const crossEdges = new Map<string, number>(); // "communityA->communityB" → count
  let totalCrossEdges = 0;

  for (const edge of allEdges) {
    const sourceFile = nodeToFile.get(edge.sourceNodeId);
    const targetFile = nodeToFile.get(edge.targetNodeId);
    if (!sourceFile || !targetFile) continue;

    const sourceCommunity = fileToCommunity.get(sourceFile);
    const targetCommunity = fileToCommunity.get(targetFile);
    if (!sourceCommunity || !targetCommunity || sourceCommunity === targetCommunity) continue;

    const key = `${sourceCommunity}->${targetCommunity}`;
    crossEdges.set(key, (crossEdges.get(key) ?? 0) + 1);
    totalCrossEdges++;
  }

  // Build Mermaid
  const lines: string[] = ["flowchart TD"];

  // Subgraphs for each community
  for (const c of communities.slice(0, 12)) {
    const id = mermaidId(`cluster_${c.id}`);
    const label = sanitize(c.label || `Cluster ${c.id}`);
    const topFiles = c.files.slice(0, 4).map((f) => shortPath(f)).join(", ");

    lines.push(`  subgraph ${id}["${label}"]`);
    lines.push(`    ${id}_info["${c.nodeCount} symbols | ${c.files.length} files"]`);
    if (topFiles) {
      lines.push(`    ${id}_files["${sanitize(topFiles)}"]`);
    }
    lines.push("  end");
  }

  // Cross-community edges (top 15 by weight)
  const sortedCrossEdges = [...crossEdges.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  for (const [key, count] of sortedCrossEdges) {
    const [from, to] = key.split("->");
    const fromId = mermaidId(`cluster_${from}`);
    const toId = mermaidId(`cluster_${to}`);
    const strength = count >= 10 ? "==>" : count >= 3 ? "-->" : "-.->";
    const label = count > 1 ? `|${count} deps|` : "";
    lines.push(`  ${fromId}_info ${strength}${label} ${toId}_info`);
  }

  // Styling
  lines.push("");
  lines.push("  classDef clusterInfo fill:#1e293b,stroke:#334155,color:#94a3b8,font-size:11px");
  lines.push("  classDef clusterFiles fill:#0f172a,stroke:#1e293b,color:#64748b,font-size:10px");

  return {
    mermaid: lines.join("\n"),
    type: "architecture",
    description: `Architecture overview: ${communities.length} modules, ${totalCrossEdges} cross-module dependencies`,
    nodeCount: allNodes.length,
    edgeCount: allEdges.length,
  };
}

// ─── Module Diagram ─────────────────────────────────────────────────────

/**
 * Single file's dependency tree — shows what it imports and what imports it.
 * 2 levels deep.
 */
export function generateModuleDiagram(projectSlug: string, filePath: string): DiagramResult {
  const db = getDb();

  // Find all nodes in this file
  const fileNodes = db
    .select({ id: codeNodes.id, symbolName: codeNodes.symbolName, symbolType: codeNodes.symbolType })
    .from(codeNodes)
    .where(and(eq(codeNodes.projectSlug, projectSlug), eq(codeNodes.filePath, filePath)))
    .all();

  if (fileNodes.length === 0) {
    return {
      mermaid: `flowchart TD\n  empty["No symbols found in ${sanitize(filePath)}"]`,
      type: "module",
      description: `No graph data for ${filePath}`,
      nodeCount: 0,
      edgeCount: 0,
    };
  }

  const fileNodeIds = new Set(fileNodes.map((n) => n.id));
  const allNodes = getProjectNodes(projectSlug);
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const allEdges = getProjectEdges(projectSlug);

  // Level 1: direct dependencies (outgoing)
  const outgoing = new Map<number, { edgeType: string; trustWeight: number }>();
  // Level 1: direct dependents (incoming)
  const incoming = new Map<number, { edgeType: string; trustWeight: number }>();

  for (const edge of allEdges) {
    if (fileNodeIds.has(edge.sourceNodeId) && !fileNodeIds.has(edge.targetNodeId)) {
      if (!outgoing.has(edge.targetNodeId)) {
        outgoing.set(edge.targetNodeId, { edgeType: edge.edgeType, trustWeight: edge.trustWeight });
      }
    }
    if (fileNodeIds.has(edge.targetNodeId) && !fileNodeIds.has(edge.sourceNodeId)) {
      if (!incoming.has(edge.sourceNodeId)) {
        incoming.set(edge.sourceNodeId, { edgeType: edge.edgeType, trustWeight: edge.trustWeight });
      }
    }
  }

  // Level 2: dependencies of dependencies (limit to 5 per level-1 node)
  const level2Outgoing = new Map<number, Set<number>>();
  for (const [targetId] of outgoing) {
    const l2 = new Set<number>();
    for (const edge of allEdges) {
      if (edge.sourceNodeId === targetId && !fileNodeIds.has(edge.targetNodeId) && !outgoing.has(edge.targetNodeId)) {
        l2.add(edge.targetNodeId);
        if (l2.size >= 5) break;
      }
    }
    if (l2.size > 0) level2Outgoing.set(targetId, l2);
  }

  // Build Mermaid
  const lines: string[] = ["flowchart LR"];
  const centerLabel = sanitize(shortPath(filePath));
  const centerId = mermaidId(`file_${filePath}`);

  // Center node
  lines.push(`  ${centerId}[["${centerLabel}"]]`);

  // Incoming (dependents)
  const incomingArr = [...incoming.entries()].slice(0, 8);
  if (incomingArr.length > 0) {
    for (const [nodeId, edge] of incomingArr) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      const id = mermaidId(`in_${nodeId}`);
      const label = sanitize(shortPath(node.filePath));
      const arrow = edge.trustWeight >= 0.7 ? "-->" : "-.->";
      lines.push(`  ${id}["${label}"] ${arrow} ${centerId}`);
    }
  }

  // Outgoing (dependencies)
  const outgoingArr = [...outgoing.entries()].slice(0, 8);
  for (const [nodeId, edge] of outgoingArr) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const id = mermaidId(`out_${nodeId}`);
    const label = sanitize(shortPath(node.filePath));
    const arrow = edge.trustWeight >= 0.7 ? "-->" : "-.->";
    lines.push(`  ${centerId} ${arrow} ${id}["${label}"]`);

    // Level 2
    const l2Nodes = level2Outgoing.get(nodeId);
    if (l2Nodes) {
      for (const l2Id of l2Nodes) {
        const l2Node = nodeMap.get(l2Id);
        if (!l2Node) continue;
        const l2MermaidId = mermaidId(`l2_${l2Id}`);
        const l2Label = sanitize(shortPath(l2Node.filePath));
        lines.push(`  ${id} -.-> ${l2MermaidId}["${l2Label}"]`);
      }
    }
  }

  // Styling
  lines.push("");
  lines.push(`  style ${centerId} fill:#6366f1,stroke:#818cf8,color:#fff,stroke-width:2px`);

  const totalEdges = incomingArr.length + outgoingArr.length;
  return {
    mermaid: lines.join("\n"),
    type: "module",
    description: `${filePath}: ${incoming.size} dependents, ${outgoing.size} dependencies`,
    nodeCount: fileNodes.length + incoming.size + outgoing.size,
    edgeCount: totalEdges,
  };
}

// ─── Flow Diagram ───────────────────────────────────────────────────────

/**
 * Execution flow from a symbol — BFS traversal of call edges.
 * Uses sequence diagram for linear chains, flowchart for branching.
 */
export function generateFlowDiagram(projectSlug: string, symbolName: string): DiagramResult {
  // Find the entry node
  const nodes = findNodesByName(projectSlug, symbolName);
  if (nodes.length === 0) {
    return {
      mermaid: `flowchart TD\n  empty["Symbol '${sanitize(symbolName)}' not found"]`,
      type: "flow",
      description: `No symbol matching '${symbolName}'`,
      nodeCount: 0,
      edgeCount: 0,
    };
  }

  // Use the first exact match, or the first partial match
  const entryNode = nodes.find((n) => n.symbolName === symbolName) ?? nodes[0]!;

  // BFS from entry node following call edges
  const allEdges = getProjectEdges(projectSlug);
  const allNodes = getProjectNodes(projectSlug);
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  // Build adjacency for call edges only
  const callAdj = new Map<number, Array<{ targetId: number; edgeType: string }>>();
  for (const edge of allEdges) {
    if (edge.edgeType === "calls" || edge.edgeType === "implements") {
      const arr = callAdj.get(edge.sourceNodeId) ?? [];
      arr.push({ targetId: edge.targetNodeId, edgeType: edge.edgeType });
      callAdj.set(edge.sourceNodeId, arr);
    }
  }

  // BFS
  const maxDepth = 4;
  const visited = new Set<number>();
  const flowEdges: Array<{ from: number; to: number; type: string }> = [];
  const queue: Array<{ nodeId: number; depth: number }> = [{ nodeId: entryNode.id, depth: 0 }];
  visited.add(entryNode.id);

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const neighbors = callAdj.get(nodeId) ?? [];
    for (const { targetId, edgeType } of neighbors) {
      flowEdges.push({ from: nodeId, to: targetId, type: edgeType });
      if (!visited.has(targetId)) {
        visited.add(targetId);
        queue.push({ nodeId: targetId, depth: depth + 1 });
      }
    }
  }

  if (flowEdges.length === 0) {
    return {
      mermaid: `flowchart TD\n  entry["${sanitize(entryNode.symbolName)}"]:::entryNode\n  entry --> none["No call edges found"]\n  classDef entryNode fill:#6366f1,color:#fff`,
      type: "flow",
      description: `${entryNode.symbolName} has no outgoing call edges`,
      nodeCount: 1,
      edgeCount: 0,
    };
  }

  // Check if it's a linear chain (each node has at most 1 outgoing)
  const outCount = new Map<number, number>();
  for (const e of flowEdges) {
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
  }
  const isLinear = [...outCount.values()].every((c) => c <= 1);

  if (isLinear && flowEdges.length <= 10) {
    return generateSequenceDiagram(entryNode, flowEdges, nodeMap);
  }

  // Flowchart for branching graphs
  const lines: string[] = ["flowchart TD"];
  const entryId = mermaidId(`n_${entryNode.id}`);
  lines.push(`  ${entryId}[["${sanitize(entryNode.symbolName)}"]]:::entryNode`);

  for (const { from, to, type } of flowEdges) {
    const fromNode = nodeMap.get(from);
    const toNode = nodeMap.get(to);
    if (!fromNode || !toNode) continue;

    const fromId = mermaidId(`n_${from}`);
    const toId = mermaidId(`n_${to}`);
    const fromLabel = sanitize(fromNode.symbolName);
    const toLabel = sanitize(toNode.symbolName);
    const arrow = type === "implements" ? "-.->|impl|" : "-->";

    if (fromId !== entryId) {
      lines.push(`  ${fromId}["${fromLabel}"]`);
    }
    lines.push(`  ${toId}["${toLabel}"]`);
    lines.push(`  ${fromId} ${arrow} ${toId}`);
  }

  lines.push("");
  lines.push("  classDef entryNode fill:#6366f1,stroke:#818cf8,color:#fff,stroke-width:2px");

  return {
    mermaid: lines.join("\n"),
    type: "flow",
    description: `Call flow from ${entryNode.symbolName}: ${visited.size} nodes, ${flowEdges.length} edges`,
    nodeCount: visited.size,
    edgeCount: flowEdges.length,
  };
}

// ─── Sequence Diagram (for linear flows) ────────────────────────────────

function generateSequenceDiagram(
  entryNode: { id: number; symbolName: string; filePath: string },
  edges: Array<{ from: number; to: number; type: string }>,
  nodeMap: Map<number, { id: number; symbolName: string; filePath: string }>,
): DiagramResult {
  const lines: string[] = ["sequenceDiagram"];

  // Collect participants in order
  const seen = new Set<number>();
  const orderedNodes: Array<{ id: number; symbolName: string; filePath: string }> = [];

  const addParticipant = (nodeId: number) => {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = nodeMap.get(nodeId) ?? { id: nodeId, symbolName: `node_${nodeId}`, filePath: "" };
    orderedNodes.push(node);
  };

  addParticipant(entryNode.id);
  for (const e of edges) {
    addParticipant(e.from);
    addParticipant(e.to);
  }

  // Declare participants
  for (const node of orderedNodes) {
    const alias = mermaidId(`p_${node.id}`);
    const label = sanitize(node.symbolName);
    lines.push(`  participant ${alias} as ${label}`);
  }

  // Arrows
  for (const { from, to, type } of edges) {
    const fromAlias = mermaidId(`p_${from}`);
    const toAlias = mermaidId(`p_${to}`);
    const arrow = type === "implements" ? "-->>" : "->>";
    lines.push(`  ${fromAlias}${arrow}${toAlias}: ${type}`);
  }

  return {
    mermaid: lines.join("\n"),
    type: "flow",
    description: `Linear call chain from ${entryNode.symbolName}: ${orderedNodes.length} participants`,
    nodeCount: orderedNodes.length,
    edgeCount: edges.length,
  };
}
