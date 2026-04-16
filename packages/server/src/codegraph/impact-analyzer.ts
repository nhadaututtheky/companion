/**
 * CodeGraph Impact Analyzer — pre-commit change analysis.
 *
 * Combines git diff, impact radius, reverse dependencies, community membership,
 * and risk scoring into a unified impact report. GitNexus-inspired feature.
 */

import { getGitDiff } from "./diff-updater.js";
import { getImpactRadius, getReverseDependencies } from "./query-engine.js";
import { computeRiskScores, detectCommunities } from "./analysis.js";
import { isGraphReady } from "./index.js";
import { createLogger } from "../logger.js";

const log = createLogger("codegraph:impact");

// ── Types ───────────────────────────────────────────────────────────

export interface ImpactReport {
  /** Files included in this analysis */
  changedFiles: string[];
  /** Overall risk level */
  overallRisk: "low" | "medium" | "high" | "critical";
  /** Numeric risk 0-1 */
  overallRiskScore: number;
  /** Per-file impact details */
  fileImpacts: FileImpact[];
  /** Communities affected by this change */
  affectedCommunities: AffectedCommunity[];
  /** Suggested review areas based on blast radius */
  suggestedReviews: string[];
  /** Total number of downstream dependents */
  totalDependents: number;
  /** Total distinct files in blast radius */
  blastRadiusFiles: number;
}

export interface FileImpact {
  filePath: string;
  changeType: "added" | "modified" | "deleted";
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Direct dependents (files that import from this file) */
  directDependents: string[];
  /** Downstream nodes reached via BFS */
  downstreamCount: number;
  /** Top risk symbols in this file */
  riskySymbols: Array<{ name: string; type: string; score: number }>;
}

export interface AffectedCommunity {
  id: string;
  label: string;
  nodeCount: number;
  /** How many changed files belong to this community */
  changedFileCount: number;
  cohesion: number;
}

// ── Risk Thresholds ─────────────────────────────────────────────────

function riskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 0.8) return "critical";
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

// ── Main Analyzer ───────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Explicit file list (overrides git diff) */
  files?: string[];
  /** Git diff reference (default: HEAD~1) */
  since?: string;
  /** Project working directory (needed for git diff) */
  projectDir?: string;
  /** Max BFS depth for impact radius (default: 2) */
  maxDepth?: number;
}

/**
 * Analyze the impact of changed files on the codebase.
 * Uses git diff to detect changes, then computes blast radius,
 * risk scores, and affected communities.
 */
export function analyzeImpact(
  projectSlug: string,
  options: AnalyzeOptions = {},
): ImpactReport {
  const { maxDepth = 2, since = "HEAD~1" } = options;

  if (!isGraphReady(projectSlug)) {
    return emptyReport([]);
  }

  // Step 1: Get changed files
  let changedFiles: Array<{ path: string; type: "added" | "modified" | "deleted" }>;

  if (options.files && options.files.length > 0) {
    changedFiles = options.files.map((f) => ({ path: f, type: "modified" as const }));
  } else if (options.projectDir) {
    const diff = getGitDiff(options.projectDir, since);
    changedFiles = [
      ...diff.added.map((f) => ({ path: f, type: "added" as const })),
      ...diff.modified.map((f) => ({ path: f, type: "modified" as const })),
      ...diff.deleted.map((f) => ({ path: f, type: "deleted" as const })),
    ];
  } else {
    return emptyReport([]);
  }

  if (changedFiles.length === 0) {
    return emptyReport([]);
  }

  const filePaths = changedFiles.map((f) => f.path);

  log.info("Analyzing impact", { projectSlug, files: filePaths.length });

  // Step 2: Compute risk scores for all changed files
  const riskScores = computeRiskScores(projectSlug, filePaths);
  const riskByFile = new Map(riskScores.map((r) => [r.filePath, r]));

  // Step 3: Get impact radius + reverse deps per file
  const allDependentFiles = new Set<string>();
  const fileImpacts: FileImpact[] = [];

  for (const { path: filePath, type } of changedFiles) {
    // Reverse dependencies (who imports from this file)
    const reverseDeps = getReverseDependencies(projectSlug, filePath);
    const directDependents = [...new Set(reverseDeps.map((r) => r.filePath))];

    // Forward impact radius (BFS outgoing)
    const downstream = getImpactRadius(projectSlug, filePath, { maxDepth });
    const downstreamFiles = new Set(downstream.map((n) => n.filePath));

    for (const dep of directDependents) allDependentFiles.add(dep);
    for (const f of downstreamFiles) allDependentFiles.add(f);

    // Get risky symbols from this file
    const fileRisks = riskScores
      .filter((r) => r.filePath === filePath)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 3)
      .map((r) => ({ name: r.symbolName, type: r.symbolType, score: r.riskScore }));

    // File-level risk = max symbol risk, or base risk for new/deleted files
    const maxSymbolRisk = fileRisks.length > 0 ? fileRisks[0]!.score : 0;
    const fileRiskScore = type === "deleted"
      ? Math.max(maxSymbolRisk, 0.6) // deletions are inherently risky
      : maxSymbolRisk;

    fileImpacts.push({
      filePath,
      changeType: type,
      riskScore: Math.round(fileRiskScore * 100) / 100,
      riskLevel: riskLevel(fileRiskScore),
      directDependents: directDependents.slice(0, 10),
      downstreamCount: downstreamFiles.size,
      riskySymbols: fileRisks,
    });
  }

  // Step 4: Find affected communities
  const communities = detectCommunities(projectSlug);
  const changedFileSet = new Set(filePaths);
  const affectedCommunities: AffectedCommunity[] = communities
    .map((c) => {
      const changedInCommunity = c.files.filter((f) => changedFileSet.has(f));
      return {
        id: c.id,
        label: c.label,
        nodeCount: c.nodeCount,
        changedFileCount: changedInCommunity.length,
        cohesion: c.cohesion,
      };
    })
    .filter((c) => c.changedFileCount > 0)
    .sort((a, b) => b.changedFileCount - a.changedFileCount);

  // Step 5: Generate suggested reviews
  const suggestedReviews = generateReviewSuggestions(fileImpacts, affectedCommunities);

  // Step 6: Overall risk = weighted avg of file risks
  const overallRiskScore = fileImpacts.length > 0
    ? fileImpacts.reduce((sum, f) => sum + f.riskScore, 0) / fileImpacts.length
    : 0;

  const report: ImpactReport = {
    changedFiles: filePaths,
    overallRisk: riskLevel(overallRiskScore),
    overallRiskScore: Math.round(overallRiskScore * 100) / 100,
    fileImpacts: fileImpacts.sort((a, b) => b.riskScore - a.riskScore),
    affectedCommunities,
    suggestedReviews,
    totalDependents: allDependentFiles.size,
    blastRadiusFiles: allDependentFiles.size + filePaths.length,
  };

  log.info("Impact analysis complete", {
    projectSlug,
    risk: report.overallRisk,
    dependents: report.totalDependents,
    communities: affectedCommunities.length,
  });

  return report;
}

// ── Helpers ─────────────────────────────────────────────────────────

function emptyReport(files: string[]): ImpactReport {
  return {
    changedFiles: files,
    overallRisk: "low",
    overallRiskScore: 0,
    fileImpacts: [],
    affectedCommunities: [],
    suggestedReviews: [],
    totalDependents: 0,
    blastRadiusFiles: files.length,
  };
}

function generateReviewSuggestions(
  impacts: FileImpact[],
  communities: AffectedCommunity[],
): string[] {
  const suggestions: string[] = [];

  // High-risk files
  const highRisk = impacts.filter((f) => f.riskScore >= 0.5);
  if (highRisk.length > 0) {
    suggestions.push(
      `Review ${highRisk.length} high-risk file(s): ${highRisk.map((f) => f.filePath).slice(0, 3).join(", ")}`,
    );
  }

  // Files with many dependents
  const highDeps = impacts.filter((f) => f.directDependents.length >= 5);
  for (const f of highDeps.slice(0, 2)) {
    suggestions.push(
      `${f.filePath} has ${f.directDependents.length} direct dependents — verify exports unchanged`,
    );
  }

  // Deleted files
  const deleted = impacts.filter((f) => f.changeType === "deleted");
  if (deleted.length > 0) {
    suggestions.push(
      `${deleted.length} deleted file(s) — check for broken imports in dependents`,
    );
  }

  // Cross-community changes
  if (communities.length >= 3) {
    suggestions.push(
      `Change spans ${communities.length} functional clusters — consider splitting into smaller commits`,
    );
  }

  // Low-cohesion community affected
  const fragile = communities.filter((c) => c.cohesion < 0.3 && c.nodeCount >= 5);
  for (const c of fragile.slice(0, 2)) {
    suggestions.push(
      `"${c.label}" cluster has low cohesion (${(c.cohesion * 100).toFixed(0)}%) — changes here may have unexpected ripple effects`,
    );
  }

  return suggestions;
}
