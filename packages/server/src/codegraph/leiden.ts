/**
 * Leiden Community Detection — pure TypeScript implementation.
 *
 * A simplified Leiden algorithm for weighted undirected graphs.
 * Optimizes modularity Q = Σ_c [ (Σ_in / 2m) - γ(Σ_tot / 2m)² ]
 * where γ is the resolution parameter.
 *
 * Reference: Traag, Waltman, van Eck (2019) "From Louvain to Leiden"
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface LeidenNode {
  id: number;
}

export interface LeidenEdge {
  source: number;
  target: number;
  weight: number;
}

export interface LeidenCommunity {
  id: number;
  members: number[];
  internalWeight: number;
  totalWeight: number;
  cohesion: number;
}

export interface LeidenResult {
  communities: LeidenCommunity[];
  modularity: number;
  iterations: number;
}

export interface LeidenOptions {
  resolution?: number; // γ — higher = more/smaller communities (default: 1.0)
  maxIterations?: number; // max refinement passes (default: 10)
  minModularityGain?: number; // stop if gain < this (default: 1e-6)
}

// ─── Algorithm ──────────────────────────────────────────────────────────

/**
 * Run Leiden community detection on a weighted graph.
 *
 * @param nodeIds - Array of unique node IDs
 * @param edges - Weighted edges (undirected — each pair counted once)
 * @param options - Algorithm parameters
 */
export function leiden(
  nodeIds: number[],
  edges: LeidenEdge[],
  options: LeidenOptions = {},
): LeidenResult {
  const { resolution = 1.0, maxIterations = 10, minModularityGain = 1e-6 } = options;

  if (nodeIds.length === 0) {
    return { communities: [], modularity: 0, iterations: 0 };
  }

  // Build adjacency list with weights
  const adj = new Map<number, Map<number, number>>();
  let totalWeight = 0;

  for (const id of nodeIds) {
    adj.set(id, new Map());
  }

  for (const edge of edges) {
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue;

    // Undirected: add both directions
    const srcAdj = adj.get(edge.source)!;
    const tgtAdj = adj.get(edge.target)!;

    srcAdj.set(edge.target, (srcAdj.get(edge.target) ?? 0) + edge.weight);
    tgtAdj.set(edge.source, (tgtAdj.get(edge.source) ?? 0) + edge.weight);
    totalWeight += edge.weight;
  }

  if (totalWeight === 0) {
    // No edges — each node is its own community
    return {
      communities: nodeIds.map((id) => ({
        id,
        members: [id],
        internalWeight: 0,
        totalWeight: 0,
        cohesion: 0,
      })),
      modularity: 0,
      iterations: 0,
    };
  }

  const m2 = totalWeight * 2; // 2m (sum of all edge weights, counted both directions)

  // Node degree (sum of edge weights)
  const degree = new Map<number, number>();
  for (const id of nodeIds) {
    let d = 0;
    for (const w of adj.get(id)!.values()) d += w;
    degree.set(id, d);
  }

  // Initialize: each node in its own community
  const community = new Map<number, number>();
  for (const id of nodeIds) {
    community.set(id, id);
  }

  // Community aggregates
  const commInternalWeight = new Map<number, number>();
  const commTotalDegree = new Map<number, number>();

  for (const id of nodeIds) {
    commInternalWeight.set(id, 0);
    commTotalDegree.set(id, degree.get(id)!);
  }

  // Add self-loop internal edges
  for (const edge of edges) {
    if (community.get(edge.source) === community.get(edge.target)) {
      const c = community.get(edge.source)!;
      commInternalWeight.set(c, (commInternalWeight.get(c) ?? 0) + edge.weight);
    }
  }

  // ─── Local Moving Phase ─────────────────────────────────────────────

  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // Shuffle node order for randomness (Fisher-Yates)
    const order = [...nodeIds];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i]!, order[j]!] = [order[j]!, order[i]!];
    }

    for (const node of order) {
      const currentComm = community.get(node)!;
      const nodeDeg = degree.get(node)!;

      // Calculate weight to each neighboring community
      const neighborComms = new Map<number, number>();
      for (const [neighbor, w] of adj.get(node)!) {
        const nComm = community.get(neighbor)!;
        neighborComms.set(nComm, (neighborComms.get(nComm) ?? 0) + w);
      }

      // Weight to own community (excluding self)
      const weightToOwn = neighborComms.get(currentComm) ?? 0;

      // Temporarily remove node from its community
      commTotalDegree.set(currentComm, commTotalDegree.get(currentComm)! - nodeDeg);
      commInternalWeight.set(currentComm, commInternalWeight.get(currentComm)! - weightToOwn);

      // Find best community to move to
      let bestComm = currentComm;
      let bestGain = 0;

      for (const [candidateComm, weightToCandidate] of neighborComms) {
        const candidateTotalDeg = commTotalDegree.get(candidateComm) ?? 0;

        // Modularity gain = [w_to_c / m] - γ [d_node * Σ_tot / (2m²)]
        const gain =
          weightToCandidate / totalWeight -
          (resolution * nodeDeg * candidateTotalDeg) / (m2 * totalWeight);

        if (gain > bestGain) {
          bestGain = gain;
          bestComm = candidateComm;
        }
      }

      // Also consider staying in current (now empty of this node)
      const stayGain =
        weightToOwn / totalWeight -
        (resolution * nodeDeg * (commTotalDegree.get(currentComm) ?? 0)) / (m2 * totalWeight);

      if (stayGain >= bestGain) {
        bestComm = currentComm;
        bestGain = stayGain;
      }

      // Move node to best community
      community.set(node, bestComm);
      commTotalDegree.set(bestComm, (commTotalDegree.get(bestComm) ?? 0) + nodeDeg);
      const weightToBest = neighborComms.get(bestComm) ?? 0;
      commInternalWeight.set(bestComm, (commInternalWeight.get(bestComm) ?? 0) + weightToBest);

      if (bestComm !== currentComm && bestGain > minModularityGain) {
        improved = true;
      }
    }
  }

  // ─── Build Results ──────────────────────────────────────────────────

  // Group nodes by community
  const groups = new Map<number, number[]>();
  for (const [nodeId, commId] of community) {
    if (!groups.has(commId)) groups.set(commId, []);
    groups.get(commId)!.push(nodeId);
  }

  // Calculate final modularity and community stats
  let modularity = 0;
  const result: LeidenCommunity[] = [];
  let commIndex = 0;

  for (const [commId, members] of groups) {
    const memberSet = new Set(members);

    // Internal weight: sum of edges where both endpoints are in this community
    let internalW = 0;
    let totalDeg = 0;

    for (const nodeId of members) {
      totalDeg += degree.get(nodeId)!;
      for (const [neighbor, w] of adj.get(nodeId)!) {
        if (memberSet.has(neighbor)) {
          internalW += w; // counted twice (both directions), divide later
        }
      }
    }
    internalW /= 2; // each internal edge was counted from both endpoints

    const cohesion = totalDeg > 0 ? (2 * internalW) / totalDeg : 0;

    // Modularity contribution: (Σ_in / 2m) - γ(Σ_tot / 2m)²
    modularity += internalW / totalWeight - resolution * (totalDeg / m2) ** 2;

    result.push({
      id: commIndex++,
      members,
      internalWeight: Math.round(internalW * 100) / 100,
      totalWeight: Math.round(totalDeg * 100) / 100,
      cohesion: Math.round(cohesion * 100) / 100,
    });
  }

  // Sort by size descending
  result.sort((a, b) => b.members.length - a.members.length);

  return {
    communities: result,
    modularity: Math.round(modularity * 10000) / 10000,
    iterations,
  };
}
