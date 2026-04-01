/**
 * CodeGraph trust weight calculator.
 * Assigns relationship strength weights to edges based on edge type patterns.
 */

export type EdgeType =
  | "imports"
  | "calls"
  | "extends"
  | "implements"
  | "uses_type"
  | "renders_component"
  | "routes_to"
  | "queries_table"
  | "tests"
  | "configures";

/** Base trust weights per edge type */
const BASE_WEIGHTS: Record<EdgeType, number> = {
  imports: 0.5,
  calls: 0.9,
  extends: 0.95,
  implements: 0.95,
  uses_type: 0.4,
  renders_component: 0.8,
  routes_to: 0.7,
  queries_table: 0.6,
  tests: 0.7,
  configures: 0.3,
};

/**
 * Calculate trust weight for an edge.
 * Combines base weight with context-based adjustments.
 */
export function calculateTrustWeight(
  edgeType: EdgeType,
  context?: { hasCall?: boolean; isReExport?: boolean },
): number {
  let weight = BASE_WEIGHTS[edgeType] ?? 0.5;

  // Import + call in same file = tight coupling
  if (edgeType === "imports" && context?.hasCall) {
    weight = 0.9;
  }

  // Re-exports are looser coupling
  if (context?.isReExport) {
    weight *= 0.7;
  }

  return Math.round(weight * 100) / 100;
}

/**
 * Calculate transitive trust: A→B→C = w(A→B) * w(B→C).
 * Used for impact analysis — how changes propagate through the graph.
 */
export function transitiveTrust(weights: number[]): number {
  if (weights.length === 0) return 0;
  return weights.reduce((acc, w) => acc * w, 1);
}
