/**
 * CodeGraph diff updater — incremental rescan based on git diff or explicit file list.
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { projects, codeFiles } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { hashFile, detectLanguage, countLines, MAX_SCAN_FILE_SIZE } from "./utils.js";
import { scanFileAsync } from "./scanner.js";
import { calculateTrustWeight, type EdgeType } from "./trust-calculator.js";
import {
  upsertFile,
  deleteNodesForFile,
  insertNodes,
  deleteEdgesForFile,
  getReverseDependentFileIds,
  insertEdges,
  getProjectNodes,
  type NodeRecord,
  type EdgeRecord,
} from "./graph-store.js";
import { describeNodes } from "./semantic-describer.js";

const log = createLogger("codegraph-diff");

// Per-project mutex to prevent concurrent rescans corrupting edge state
const rescanLocks = new Map<string, Promise<unknown>>();

// ─── Types ───────────────────────────────────────────────────────────────

export interface DiffResult {
  added: string[];
  modified: string[];
  deleted: string[];
}

// ─── Git Diff ────────────────────────────────────────────────────────────

/**
 * Get changed files from git diff.
 * Falls back to empty result if not a git repo or git fails.
 */
export function getGitDiff(projectDir: string, since = "HEAD~1"): DiffResult {
  const result: DiffResult = { added: [], modified: [], deleted: [] };

  try {
    const output = execSync(`git diff ${since} --name-status --no-renames`, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 10_000,
    });

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const status = trimmed[0];
      const filePath = trimmed.slice(1).trim().replace(/\\/g, "/");

      switch (status) {
        case "A":
          result.added.push(filePath);
          break;
        case "M":
          result.modified.push(filePath);
          break;
        case "D":
          result.deleted.push(filePath);
          break;
      }
    }
  } catch (err) {
    log.debug("Git diff failed, returning empty result", { projectDir, error: String(err) });
  }

  return result;
}

// ─── Incremental Rescan ──────────────────────────────────────────────────

/**
 * Incrementally rescan changed files in a project.
 * If changedFiles is provided, use those. Otherwise, detect via git diff.
 * Serialized per-project to prevent concurrent rescans corrupting edge state.
 */
export async function incrementalRescan(
  projectSlug: string,
  changedFiles?: string[],
): Promise<{ updated: number; added: number; deleted: number }> {
  // Serialize: wait for any in-flight rescan on the same project
  const pending = rescanLocks.get(projectSlug);
  const task = (pending ?? Promise.resolve()).then(() =>
    doIncrementalRescan(projectSlug, changedFiles),
  );
  rescanLocks.set(projectSlug, task.catch(() => {})); // swallow to not block next
  return task;
}

async function doIncrementalRescan(
  projectSlug: string,
  changedFiles?: string[],
): Promise<{ updated: number; added: number; deleted: number }> {
  const db = getDb();

  // Get project directory
  const project = db
    .select({ dir: projects.dir })
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .get();

  if (!project) {
    log.warn("Project not found for rescan", { projectSlug });
    return { updated: 0, added: 0, deleted: 0 };
  }

  const projectDir = project.dir;
  let filesToRescan: string[];
  let deletedFiles: string[] = [];

  if (changedFiles && changedFiles.length > 0) {
    // Use explicitly provided list — all are modified/added
    filesToRescan = changedFiles.map((f) => f.replace(/\\/g, "/"));
  } else {
    // Use git diff
    const diff = getGitDiff(projectDir);
    filesToRescan = [...diff.added, ...diff.modified];
    deletedFiles = diff.deleted;
  }

  if (filesToRescan.length === 0 && deletedFiles.length === 0) {
    return { updated: 0, added: 0, deleted: 0 };
  }

  log.info("Incremental rescan", {
    projectSlug,
    rescan: filesToRescan.length,
    delete: deletedFiles.length,
  });

  let updated = 0;
  let added = 0;
  let deleted = 0;

  // 1. Handle deleted files
  for (const filePath of deletedFiles) {
    const existing = db
      .select({ id: codeFiles.id })
      .from(codeFiles)
      .where(and(eq(codeFiles.projectSlug, projectSlug), eq(codeFiles.filePath, filePath)))
      .get();

    if (existing) {
      // CASCADE deletes nodes + edges
      db.delete(codeFiles).where(eq(codeFiles.id, existing.id)).run();
      deleted++;
    }
  }

  // 2. Rescan modified/added files
  const rescannedFileIds: number[] = [];

  for (const relPath of filesToRescan) {
    const absPath = join(projectDir, relPath);

    if (!existsSync(absPath)) {
      // File was listed but doesn't exist — treat as deleted
      const existing = db
        .select({ id: codeFiles.id })
        .from(codeFiles)
        .where(and(eq(codeFiles.projectSlug, projectSlug), eq(codeFiles.filePath, relPath)))
        .get();

      if (existing) {
        db.delete(codeFiles).where(eq(codeFiles.id, existing.id)).run();
        deleted++;
      }
      continue;
    }

    const language = detectLanguage(relPath);
    const fileHash = hashFile(absPath);

    let code: string;
    try {
      code = readFileSync(absPath, "utf-8");
    } catch {
      continue;
    }

    // Skip oversized files (bundled JS, generated code, etc.)
    if (code.length > MAX_SCAN_FILE_SIZE) {
      log.debug("Skipping oversized file", { filePath: relPath, size: code.length });
      continue;
    }

    const lines = countLines(code);

    // Check if the file already exists with same hash
    const existingFile = db
      .select({ id: codeFiles.id, fileHash: codeFiles.fileHash })
      .from(codeFiles)
      .where(and(eq(codeFiles.projectSlug, projectSlug), eq(codeFiles.filePath, relPath)))
      .get();

    if (existingFile && existingFile.fileHash === fileHash) {
      continue; // Unchanged
    }

    const fileId = upsertFile({
      projectSlug,
      filePath: relPath,
      fileHash,
      totalLines: lines,
      language,
    });

    // Delete old nodes for this file
    deleteNodesForFile(fileId);

    // Scan (prefer Tree-sitter, fall back to regex)
    const result = await scanFileAsync(code, relPath, language);

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
    }

    rescannedFileIds.push(fileId);

    if (existingFile) {
      updated++;
    } else {
      added++;
    }
  }

  // 3. Incremental edge resolution — only re-resolve edges for changed + dependent files
  if (rescannedFileIds.length > 0) {
    const rescannedSet = new Set(rescannedFileIds);

    // Step 1: Collect dependent files BEFORE deleting edges (edges are needed for lookup)
    const dependentFileIds = new Set<number>();
    for (const fileId of rescannedFileIds) {
      const deps = getReverseDependentFileIds(projectSlug, fileId);
      for (const depId of deps) {
        if (!rescannedSet.has(depId)) {
          dependentFileIds.add(depId);
        }
      }
    }

    // Step 2: Delete edges for changed files + dependent files
    for (const fileId of rescannedFileIds) {
      deleteEdgesForFile(projectSlug, fileId);
    }
    for (const depFileId of dependentFileIds) {
      deleteEdgesForFile(projectSlug, depFileId);
    }

    // Build full node index (needed for target resolution)
    const allNodes = getProjectNodes(projectSlug);
    const nodesByName = new Map<string, (typeof allNodes)[0]>();
    const nodesByFile = new Map<string, (typeof allNodes)>();
    for (const node of allNodes) {
      nodesByName.set(node.symbolName, node);
      const arr = nodesByFile.get(node.filePath);
      if (arr) arr.push(node);
      else nodesByFile.set(node.filePath, [node]);
    }

    // Step 4: Re-resolve edges for changed files + dependents only
    const filesToResolve = new Set([...rescannedFileIds, ...dependentFileIds]);

    const filesToScan = db
      .select({ id: codeFiles.id, filePath: codeFiles.filePath, language: codeFiles.language })
      .from(codeFiles)
      .where(eq(codeFiles.projectSlug, projectSlug))
      .all()
      .filter((f) => filesToResolve.has(f.id));

    const resolvedEdges: EdgeRecord[] = [];

    for (const file of filesToScan) {
      const absPath = join(projectDir, file.filePath);
      if (!existsSync(absPath)) continue;

      let code: string;
      try {
        code = readFileSync(absPath, "utf-8");
      } catch {
        continue;
      }
      if (code.length > MAX_SCAN_FILE_SIZE) continue;

      const result = await scanFileAsync(code, file.filePath, file.language);
      const fileNodes = nodesByFile.get(file.filePath) ?? [];

      if (fileNodes.length === 0 && result.edges.length > 0) {
        log.debug("Skipping edges for node-less file", { filePath: file.filePath });
        continue;
      }

      for (const edge of result.edges) {
        let sourceNode =
          edge.sourceSymbol === "__file__"
            ? fileNodes[0]
            : fileNodes.find((n) => n.symbolName === edge.sourceSymbol);

        if (!sourceNode && fileNodes.length > 0) sourceNode = fileNodes[0];
        if (!sourceNode) continue;

        const targetNode = nodesByName.get(edge.targetSymbol);
        if (!targetNode || sourceNode.id === targetNode.id) continue;

        resolvedEdges.push({
          projectSlug,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          edgeType: edge.edgeType as EdgeType,
          trustWeight: calculateTrustWeight(edge.edgeType as EdgeType),
          context: edge.context,
        });
      }
    }

    // Deduplicate
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

    log.info("Incremental edge resolution", {
      projectSlug,
      changedFiles: rescannedFileIds.length,
      dependentFiles: dependentFileIds.size,
      totalEdges: uniqueEdges.length,
    });
  }

  // 4. Sync FTS5 index for changed files (within mutex scope)
  if (updated + added > 0) {
    try {
      const { populateFtsIndex } = await import("./analysis.js");
      populateFtsIndex(projectSlug);
    } catch (err) {
      log.warn("FTS5 sync failed (non-fatal)", { error: String(err) });
    }
  }

  // 5. Re-describe changed nodes (non-blocking)
  if (updated + added > 0) {
    void describeNodes(projectSlug).catch((err) => {
      log.warn("Post-rescan description failed", { error: String(err) });
    });
  }

  log.info("Incremental rescan complete", { projectSlug, updated, added, deleted });
  return { updated, added, deleted };
}
