import { create } from "zustand";

// ─── Types ──────────���────────────────────────────��──────────────────────

export interface GraphNodeTouch {
  count: number;
  lastTouched: number;
  toolName: string;
  toolAction: "read" | "modify" | "create";
}

export interface ImpactNode {
  nodeId: string;
  distance: number;
  fromNodeId: string;
}

/** Fog-of-war reveal state for each node */
export type RevealState = "untouched" | "read" | "modified" | "hot";

interface GraphActivityStore {
  /** nodeId → touch record */
  touchedNodes: Map<string, GraphNodeTouch>;
  /** nodeId → impact (secondary highlights from BFS) */
  impactNodes: Map<string, ImpactNode>;
  /** filePath → tool action for fog-of-war */
  fileActions: Map<string, "read" | "modify" | "create">;
  /** nodeId → fog reveal state */
  revealStates: Map<string, RevealState>;
  /** Total activity events received */
  totalEvents: number;
  /** Whether fog-of-war is enabled */
  fogEnabled: boolean;

  /** Record a graph:activity event */
  recordActivity: (event: {
    nodeIds: string[];
    filePaths: string[];
    toolName: string;
    toolAction: "read" | "modify" | "create";
  }) => void;

  /** Set computed impact nodes (called after BFS) */
  setImpactNodes: (impacts: Map<string, ImpactNode>) => void;

  /** Toggle fog-of-war mode */
  setFogEnabled: (enabled: boolean) => void;

  /** Clear all activity (on session switch or disconnect) */
  clear: () => void;
}

// ─── Store ──��─────────────────────────────────────��─────────────────────

export const useGraphActivityStore = create<GraphActivityStore>((set) => ({
  touchedNodes: new Map(),
  impactNodes: new Map(),
  fileActions: new Map(),
  revealStates: new Map(),
  totalEvents: 0,
  fogEnabled: false, // off by default, user enables

  recordActivity: (event) =>
    set((state) => {
      const touchedNodes = new Map(state.touchedNodes);
      const fileActions = new Map(state.fileActions);
      const revealStates = new Map(state.revealStates);

      for (const nodeId of event.nodeIds) {
        const existing = touchedNodes.get(nodeId);
        const newCount = (existing?.count ?? 0) + 1;
        touchedNodes.set(nodeId, {
          count: newCount,
          lastTouched: Date.now(),
          toolName: event.toolName,
          toolAction: event.toolAction,
        });

        // Compute reveal state: untouched → read → modified → hot
        const currentReveal = revealStates.get(nodeId) ?? "untouched";
        let newReveal: RevealState;
        if (event.toolAction === "modify" || event.toolAction === "create") {
          newReveal = newCount >= 3 ? "hot" : "modified";
        } else {
          // read action — only upgrade if currently untouched
          newReveal = currentReveal === "untouched" ? "read" : currentReveal;
        }
        // Never downgrade
        const revealPriority: Record<RevealState, number> = {
          untouched: 0,
          read: 1,
          modified: 2,
          hot: 3,
        };
        if (revealPriority[newReveal] > revealPriority[currentReveal]) {
          revealStates.set(nodeId, newReveal);
        }
        // Check if existing modified → hot upgrade
        if (currentReveal === "modified" && newCount >= 3) {
          revealStates.set(nodeId, "hot");
        }
      }

      // Track file actions for all paths
      const priority = { read: 0, create: 1, modify: 2 } as const;
      for (const filePath of event.filePaths) {
        const currentAction = fileActions.get(filePath);
        if (!currentAction || priority[event.toolAction] > priority[currentAction]) {
          fileActions.set(filePath, event.toolAction);
        }
      }

      return {
        touchedNodes,
        fileActions,
        revealStates,
        totalEvents: state.totalEvents + 1,
      };
    }),

  setImpactNodes: (impacts) => set({ impactNodes: impacts }),

  setFogEnabled: (enabled) => set({ fogEnabled: enabled }),

  clear: () =>
    set({
      touchedNodes: new Map(),
      impactNodes: new Map(),
      fileActions: new Map(),
      revealStates: new Map(),
      totalEvents: 0,
    }),
}));

// ─── Impact Radius BFS ─────���───────────────────────────────────────────

/**
 * Compute impact radius via BFS on ReactFlow edges.
 * Uses REVERSE edges only (who depends on the touched node = who is impacted by changes).
 * "A imports B" means edge source=A, target=B. If B is touched, A is impacted.
 *
 * @param touchedNodeIds - currently active node IDs
 * @param edges - ReactFlow edges array (source → target = "source uses target")
 * @param maxHops - BFS depth limit (default 2)
 * @param maxNodes - max secondary nodes to return (default 15)
 */
export function computeImpactRadius(
  touchedNodeIds: Set<string>,
  edges: Array<{ source: string; target: string }>,
  maxHops = 2,
  maxNodes = 15,
): Map<string, ImpactNode> {
  if (touchedNodeIds.size === 0) return new Map();

  // Build REVERSE adjacency: target → [sources that depend on it]
  // If edge is source→target (source imports/uses target),
  // then touching target impacts source (reverse direction)
  const reverseAdj = new Map<string, string[]>();
  for (const edge of edges) {
    const dependents = reverseAdj.get(edge.target) ?? [];
    dependents.push(edge.source);
    reverseAdj.set(edge.target, dependents);
  }

  // BFS from all touched nodes following reverse edges
  const impacts = new Map<string, ImpactNode>();
  const visited = new Set<string>(touchedNodeIds);
  let frontier = [...touchedNodeIds];
  let distance = 1;

  while (distance <= maxHops && frontier.length > 0 && impacts.size < maxNodes) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const dependents = reverseAdj.get(nodeId) ?? [];
      for (const dep of dependents) {
        if (visited.has(dep)) continue;
        if (impacts.size >= maxNodes) break;

        visited.add(dep);
        impacts.set(dep, {
          nodeId: dep,
          distance,
          fromNodeId: nodeId,
        });
        nextFrontier.push(dep);
      }
    }

    frontier = nextFrontier;
    distance++;
  }

  return impacts;
}
