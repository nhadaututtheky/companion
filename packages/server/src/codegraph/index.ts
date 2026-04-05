/**
 * CodeGraph — Persistent Code Intelligence Engine.
 * Public API: scanProject, getScanStatus, isGraphReady, getProjectStats.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { projects, codeFiles as codeFilesTable } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { discoverFiles, hashFile, detectLanguage, countLines } from "./utils.js";
import { scanFile, scanFileAsync, type ScannedEdge } from "./scanner.js";
import { calculateTrustWeight, type EdgeType } from "./trust-calculator.js";
import {
  upsertFile,
  isFileUnchanged,
  deleteStaleFiles,
  deleteNodesForFile,
  insertNodes,
  deleteEdgesForProject,
  insertEdges,
  getProjectNodes,
  createScanJob,
  updateScanJob,
  getLatestScanJob,
  type NodeRecord,
  type EdgeRecord,
} from "./graph-store.js";

const log = createLogger("codegraph");

// ─── Active Scans ────────────────────────────────────────────────────────

const activeScans = new Map<string, { jobId: number; abort: boolean }>();

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Scan a project's codebase and populate the code graph.
 * Runs async, returns the scan job ID for status polling.
 * If a scan is already running for this project, returns existing job ID.
 */
export async function scanProject(projectSlug: string): Promise<number> {
  // Check for active scan
  const existing = activeScans.get(projectSlug);
  if (existing) {
    log.info("Scan already running", { projectSlug, jobId: existing.jobId });
    return existing.jobId;
  }

  // Get project directory
  const db = getDb();
  const project = db
    .select({ dir: projects.dir })
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .get();

  if (!project) {
    throw new Error(`Project not found: ${projectSlug}`);
  }

  const jobId = createScanJob(projectSlug);
  const scanState = { jobId, abort: false };
  activeScans.set(projectSlug, scanState);

  // Run async
  void runScan(projectSlug, project.dir, jobId, scanState).finally(() => {
    activeScans.delete(projectSlug);
  });

  return jobId;
}

/**
 * Get the status of the latest scan for a project.
 */
export function getScanStatus(projectSlug: string) {
  return getLatestScanJob(projectSlug);
}

/**
 * Check if the code graph is ready (has been scanned at least once).
 */
export function isGraphReady(projectSlug: string): boolean {
  const job = getLatestScanJob(projectSlug);
  return job?.status === "done";
}

/**
 * Get project graph statistics.
 */
export { getProjectStats } from "./graph-store.js";

/**
 * Generate semantic descriptions for undescribed exported nodes.
 * Uses AI (Haiku tier). Returns count of descriptions generated.
 */
export { describeNodes as describeProject } from "./semantic-describer.js";

/**
 * Incrementally rescan changed files in a project.
 */
export { incrementalRescan } from "./diff-updater.js";

/**
 * Get external package dependencies from the code graph.
 */
export { getExternalPackages, buildDependencySummary } from "./webintel-bridge.js";

/**
 * Cancel an active scan.
 */
export function cancelScan(projectSlug: string): boolean {
  const scan = activeScans.get(projectSlug);
  if (!scan) return false;
  scan.abort = true;
  return true;
}

// ─── Scan Runner ─────────────────────────────────────────────────────────

async function runScan(
  projectSlug: string,
  projectDir: string,
  jobId: number,
  scanState: { abort: boolean },
): Promise<void> {
  const startTime = Date.now();
  let totalNodes = 0;

  try {
    log.info("Starting scan", { projectSlug, projectDir });

    // 1. Discover files
    const filePaths = await discoverFiles(projectDir);
    updateScanJob(jobId, { totalFiles: filePaths.length });
    log.info("Discovered files", { projectSlug, count: filePaths.length });

    if (filePaths.length === 0) {
      updateScanJob(jobId, { status: "done", completedAt: new Date() });
      return;
    }

    // 2. Clean up stale files
    const staleCount = deleteStaleFiles(projectSlug, filePaths);
    if (staleCount > 0) {
      log.info("Cleaned stale files", { projectSlug, count: staleCount });
    }

    // 3. Scan files in batches
    // Collect all scanned edges for cross-file resolution in second pass
    const allEdges: Array<{ fileId: number; filePath: string; edges: ScannedEdge[] }> = [];
    const fileIdMap = new Map<string, number>(); // filePath → fileId

    const BATCH_SIZE = 50;
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      if (scanState.abort) {
        log.info("Scan aborted", { projectSlug, jobId });
        updateScanJob(jobId, {
          status: "error",
          errorMessage: "Aborted by user",
          completedAt: new Date(),
        });
        return;
      }

      const batch = filePaths.slice(i, i + BATCH_SIZE);

      for (const relPath of batch) {
        const absPath = join(projectDir, relPath);
        const language = detectLanguage(relPath);
        const fileHash = hashFile(absPath);

        // Skip unchanged files
        if (isFileUnchanged(projectSlug, relPath, fileHash)) {
          const existing = getDb()
            .select({ id: codeFilesTable.id })
            .from(codeFilesTable)
            .where(
              and(
                eq(codeFilesTable.projectSlug, projectSlug),
                eq(codeFilesTable.filePath, relPath),
              ),
            )
            .get();
          if (existing) fileIdMap.set(relPath, existing.id);
          continue;
        }

        // Read and scan file
        let code: string;
        try {
          code = readFileSync(absPath, "utf-8");
        } catch {
          continue; // Skip unreadable files
        }

        const lines = countLines(code);
        const fileId = upsertFile({
          projectSlug,
          filePath: relPath,
          fileHash,
          totalLines: lines,
          language,
        });
        fileIdMap.set(relPath, fileId);

        // Delete old nodes for this file (will re-insert)
        deleteNodesForFile(fileId);

        // Scan (prefer Tree-sitter, fall back to regex)
        const result = await scanFileAsync(code, relPath, language);

        // Insert nodes
        if (result.nodes.length > 0) {
          const nodeRecords: NodeRecord[] = result.nodes.map((n) => ({
            projectSlug,
            fileId,
            filePath: relPath,
            symbolName: n.symbolName,
            symbolType: n.symbolType,
            signature: n.signature,
            isExported: n.isExported,
            lineStart: n.lineStart,
            lineEnd: n.lineEnd,
            bodyPreview: n.bodyPreview,
          }));
          insertNodes(nodeRecords);
          totalNodes += nodeRecords.length;
        }

        // Collect edges for second pass
        if (result.edges.length > 0) {
          allEdges.push({ fileId, filePath: relPath, edges: result.edges });
        }
      }

      updateScanJob(jobId, {
        scannedFiles: Math.min(i + BATCH_SIZE, filePaths.length),
        totalNodes,
      });
    }

    // 4. Second pass: resolve edges (match symbols to actual node IDs)
    log.info("Resolving edges", { projectSlug, edgeSources: allEdges.length });
    deleteEdgesForProject(projectSlug);

    const allNodes = getProjectNodes(projectSlug);
    const nodesByName = new Map<string, (typeof allNodes)[0]>();
    const nodesByFile = new Map<string, (typeof allNodes)>();
    for (const node of allNodes) {
      nodesByName.set(node.symbolName, node);
      const arr = nodesByFile.get(node.filePath);
      if (arr) arr.push(node);
      else nodesByFile.set(node.filePath, [node]);
    }

    const resolvedEdges: EdgeRecord[] = [];

    for (const { filePath, edges } of allEdges) {
      // Get the file's nodes (source candidates)
      const fileNodes = nodesByFile.get(filePath) ?? [];

      if (fileNodes.length === 0 && edges.length > 0) {
        log.debug("Skipping edges for node-less file", { filePath });
        continue;
      }

      for (const edge of edges) {
        // Find source node
        let sourceNode =
          edge.sourceSymbol === "__file__"
            ? fileNodes[0] // Use first symbol in file as proxy
            : fileNodes.find((n) => n.symbolName === edge.sourceSymbol);

        if (!sourceNode && fileNodes.length > 0) {
          sourceNode = fileNodes[0];
        }
        if (!sourceNode) continue;

        // Find target node
        let targetNode = nodesByName.get(edge.targetSymbol);

        // For import edges, try to find target by resolving the path
        if (
          !targetNode &&
          edge.edgeType === "imports" &&
          edge.targetSymbol !== "*" &&
          edge.targetSymbol !== "default"
        ) {
          targetNode = nodesByName.get(edge.targetSymbol);
        }

        if (!targetNode) continue;
        if (sourceNode.id === targetNode.id) continue;

        const trustWeight = calculateTrustWeight(edge.edgeType as EdgeType);

        resolvedEdges.push({
          projectSlug,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          edgeType: edge.edgeType,
          trustWeight,
          context: edge.context,
        });
      }
    }

    // Deduplicate edges (same source → target → type)
    const edgeKey = (e: EdgeRecord) => `${e.sourceNodeId}-${e.targetNodeId}-${e.edgeType}`;
    const uniqueEdges = [...new Map(resolvedEdges.map((e) => [edgeKey(e), e])).values()];

    // Upgrade import trust when import + call coexist for same source file
    // (import edges use file-proxy node, call edges use actual caller node — compare by file)
    const nodeToFile = new Map<number, string>();
    for (const node of allNodes) nodeToFile.set(node.id, node.filePath);

    const filesWithCalls = new Set(
      uniqueEdges
        .filter((e) => e.edgeType === "calls")
        .map((e) => nodeToFile.get(e.sourceNodeId))
        .filter(Boolean),
    );

    for (const e of uniqueEdges) {
      if (e.edgeType === "imports" && e.trustWeight < 0.9) {
        const sourceFile = nodeToFile.get(e.sourceNodeId);
        if (sourceFile && filesWithCalls.has(sourceFile)) {
          e.trustWeight = calculateTrustWeight("imports", { hasCall: true });
        }
      }
    }

    insertEdges(uniqueEdges);
    const totalEdges = uniqueEdges.length;

    // 5. Semantic descriptions (non-blocking phase)
    updateScanJob(jobId, { status: "describing" as "running" });
    try {
      const { describeNodes } = await import("./semantic-describer.js");
      const described = await describeNodes(projectSlug);
      log.info("Descriptions generated", { projectSlug, described });
    } catch (err) {
      log.warn("Description phase failed (non-fatal)", { error: String(err) });
    }

    // 6. Done
    const elapsed = Date.now() - startTime;
    updateScanJob(jobId, {
      status: "done",
      totalNodes,
      totalEdges,
      completedAt: new Date(),
    });

    log.info("Scan completed", {
      projectSlug,
      files: filePaths.length,
      nodes: totalNodes,
      edges: totalEdges,
      elapsedMs: elapsed,
    });
  } catch (err) {
    log.error("Scan failed", { projectSlug, jobId, error: String(err) });
    updateScanJob(jobId, {
      status: "error",
      errorMessage: String(err),
      completedAt: new Date(),
    });
  }
}
