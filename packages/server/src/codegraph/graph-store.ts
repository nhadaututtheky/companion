/**
 * CodeGraph graph store — Drizzle CRUD for code_files, code_nodes, code_edges.
 */

import { eq, and, inArray, sql, like } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { codeFiles, codeNodes, codeEdges, codeScanJobs } from "../db/schema.js";
import type { EdgeType } from "./trust-calculator.js";

// ─── Types ───────────────────────────────────────────────────────────────

export interface FileRecord {
  projectSlug: string;
  filePath: string;
  fileHash: string;
  totalLines: number;
  language: string;
}

export interface NodeRecord {
  projectSlug: string;
  fileId: number;
  filePath: string;
  symbolName: string;
  symbolType: string;
  signature: string | null;
  isExported: boolean;
  lineStart: number;
  lineEnd: number;
  bodyPreview: string | null;
}

export interface EdgeRecord {
  projectSlug: string;
  sourceNodeId: number;
  targetNodeId: number;
  edgeType: EdgeType;
  trustWeight: number;
  context: string | null;
}

// ─── Files ───────────────────────────────────────────────────────────────

/** Upsert a file record. Returns the file ID. */
export function upsertFile(file: FileRecord): number {
  const db = getDb();
  const now = new Date();

  const existing = db
    .select({ id: codeFiles.id, fileHash: codeFiles.fileHash })
    .from(codeFiles)
    .where(and(eq(codeFiles.projectSlug, file.projectSlug), eq(codeFiles.filePath, file.filePath)))
    .get();

  if (existing) {
    if (existing.fileHash === file.fileHash) {
      return existing.id; // unchanged
    }
    db.update(codeFiles)
      .set({
        fileHash: file.fileHash,
        totalLines: file.totalLines,
        language: file.language,
        lastScannedAt: now,
      })
      .where(eq(codeFiles.id, existing.id))
      .run();
    return existing.id;
  }

  const result = db
    .insert(codeFiles)
    .values({
      projectSlug: file.projectSlug,
      filePath: file.filePath,
      fileHash: file.fileHash,
      totalLines: file.totalLines,
      language: file.language,
      lastScannedAt: now,
    })
    .returning({ id: codeFiles.id })
    .get();

  return result!.id;
}

/** Check if a file has changed since last scan (by hash). */
export function isFileUnchanged(projectSlug: string, filePath: string, fileHash: string): boolean {
  const db = getDb();
  const existing = db
    .select({ fileHash: codeFiles.fileHash })
    .from(codeFiles)
    .where(and(eq(codeFiles.projectSlug, projectSlug), eq(codeFiles.filePath, filePath)))
    .get();

  return existing?.fileHash === fileHash;
}

/** Delete files that no longer exist in the project. */
export function deleteStaleFiles(projectSlug: string, currentPaths: string[]): number {
  if (currentPaths.length === 0) return 0;

  const db = getDb();
  const existingFiles = db
    .select({ id: codeFiles.id, filePath: codeFiles.filePath })
    .from(codeFiles)
    .where(eq(codeFiles.projectSlug, projectSlug))
    .all();

  const currentSet = new Set(currentPaths);
  const staleIds = existingFiles.filter((f) => !currentSet.has(f.filePath)).map((f) => f.id);

  if (staleIds.length === 0) return 0;

  // CASCADE will handle nodes and edges
  db.delete(codeFiles).where(inArray(codeFiles.id, staleIds)).run();

  return staleIds.length;
}

// ─── Nodes ───────────────────────────────────────────────────────────────

/** Delete all nodes for a file (before re-inserting fresh scan results). */
export function deleteNodesForFile(fileId: number): void {
  const db = getDb();
  db.delete(codeNodes).where(eq(codeNodes.fileId, fileId)).run();
}

/** Bulk insert nodes. Returns inserted IDs. */
export function insertNodes(nodes: NodeRecord[]): number[] {
  if (nodes.length === 0) return [];

  const db = getDb();
  const now = new Date();
  const ids: number[] = [];

  // Insert in batches of 100 to avoid SQLite limits
  for (let i = 0; i < nodes.length; i += 100) {
    const batch = nodes.slice(i, i + 100);
    const results = db
      .insert(codeNodes)
      .values(
        batch.map((n) => ({
          ...n,
          updatedAt: now,
        })),
      )
      .returning({ id: codeNodes.id })
      .all();

    ids.push(...results.map((r) => r.id));
  }

  return ids;
}

// ─── Edges ───────────────────────────────────────────────────────────────

/** Delete all edges for a project (full rescan). */
export function deleteEdgesForProject(projectSlug: string): void {
  const db = getDb();
  db.delete(codeEdges).where(eq(codeEdges.projectSlug, projectSlug)).run();
}

/**
 * Delete edges connected to a specific file's nodes (outgoing + incoming).
 * Used by incremental rescan to surgically remove only the affected file's edges.
 */
export function deleteEdgesForFile(projectSlug: string, fileId: number): number {
  const db = getDb();

  // Get node IDs for this file
  const fileNodeIds = db
    .select({ id: codeNodes.id })
    .from(codeNodes)
    .where(and(eq(codeNodes.projectSlug, projectSlug), eq(codeNodes.fileId, fileId)))
    .all()
    .map((n) => n.id);

  if (fileNodeIds.length === 0) return 0;

  // Delete edges where source OR target is one of this file's nodes
  let deleted = 0;

  // Outgoing edges (from this file's nodes)
  const outgoing = db
    .delete(codeEdges)
    .where(
      and(eq(codeEdges.projectSlug, projectSlug), inArray(codeEdges.sourceNodeId, fileNodeIds)),
    )
    .returning({ id: codeEdges.id })
    .all();
  deleted += outgoing.length;

  // Incoming edges (to this file's nodes)
  const incoming = db
    .delete(codeEdges)
    .where(
      and(eq(codeEdges.projectSlug, projectSlug), inArray(codeEdges.targetNodeId, fileNodeIds)),
    )
    .returning({ id: codeEdges.id })
    .all();
  deleted += incoming.length;

  return deleted;
}

/**
 * Get all file IDs that have edges pointing TO the given file's nodes.
 * Returns the reverse-dependent file IDs (who imports/calls this file).
 */
export function getReverseDependentFileIds(projectSlug: string, fileId: number): number[] {
  const db = getDb();

  // Get this file's node IDs
  const fileNodeIds = db
    .select({ id: codeNodes.id })
    .from(codeNodes)
    .where(and(eq(codeNodes.projectSlug, projectSlug), eq(codeNodes.fileId, fileId)))
    .all()
    .map((n) => n.id);

  if (fileNodeIds.length === 0) return [];

  // Find source nodes that point TO this file's nodes
  const edges = db
    .select({ sourceNodeId: codeEdges.sourceNodeId })
    .from(codeEdges)
    .where(
      and(eq(codeEdges.projectSlug, projectSlug), inArray(codeEdges.targetNodeId, fileNodeIds)),
    )
    .all();

  // Get unique file IDs for those source nodes
  const sourceNodeIds = [...new Set(edges.map((e) => e.sourceNodeId))];
  if (sourceNodeIds.length === 0) return [];

  const sourceFiles = db
    .select({ fileId: codeNodes.fileId })
    .from(codeNodes)
    .where(inArray(codeNodes.id, sourceNodeIds))
    .all();

  return [...new Set(sourceFiles.map((f) => f.fileId).filter((id) => id !== fileId))];
}

/** Bulk insert edges. */
export function insertEdges(edges: EdgeRecord[]): void {
  if (edges.length === 0) return;

  const db = getDb();
  const now = new Date();

  for (let i = 0; i < edges.length; i += 100) {
    const batch = edges.slice(i, i + 100);
    db.insert(codeEdges)
      .values(
        batch.map((e) => ({
          ...e,
          updatedAt: now,
        })),
      )
      .run();
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────

/** Get all nodes for a project. */
export function getProjectNodes(projectSlug: string) {
  const db = getDb();
  return db.select().from(codeNodes).where(eq(codeNodes.projectSlug, projectSlug)).all();
}

/** Get all edges for a project. */
export function getProjectEdges(projectSlug: string) {
  const db = getDb();
  return db.select().from(codeEdges).where(eq(codeEdges.projectSlug, projectSlug)).all();
}

/** Find nodes by symbol name (case-insensitive LIKE). */
export function findNodesByName(projectSlug: string, symbolName: string) {
  const db = getDb();
  return db
    .select()
    .from(codeNodes)
    .where(
      and(eq(codeNodes.projectSlug, projectSlug), like(codeNodes.symbolName, `%${symbolName}%`)),
    )
    .all();
}

/** Get edges where a node is source or target. */
export function getNodeEdges(nodeId: number) {
  const db = getDb();
  const asSource = db.select().from(codeEdges).where(eq(codeEdges.sourceNodeId, nodeId)).all();
  const asTarget = db.select().from(codeEdges).where(eq(codeEdges.targetNodeId, nodeId)).all();
  return { outgoing: asSource, incoming: asTarget };
}

/** Get project stats. */
export function getProjectStats(projectSlug: string) {
  const db = getDb();

  const fileCount = db
    .select({ count: sql<number>`count(*)` })
    .from(codeFiles)
    .where(eq(codeFiles.projectSlug, projectSlug))
    .get();

  const nodeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(codeNodes)
    .where(eq(codeNodes.projectSlug, projectSlug))
    .get();

  const edgeCount = db
    .select({ count: sql<number>`count(*)` })
    .from(codeEdges)
    .where(eq(codeEdges.projectSlug, projectSlug))
    .get();

  return {
    files: fileCount?.count ?? 0,
    nodes: nodeCount?.count ?? 0,
    edges: edgeCount?.count ?? 0,
  };
}

// ─── Scan Jobs ───────────────────────────────────────────────────────────

/** Create a new scan job. */
export function createScanJob(projectSlug: string): number {
  const db = getDb();
  const result = db
    .insert(codeScanJobs)
    .values({
      projectSlug,
      status: "scanning",
      startedAt: new Date(),
    })
    .returning({ id: codeScanJobs.id })
    .get();
  return result!.id;
}

/** Update scan job progress. */
export function updateScanJob(
  jobId: number,
  update: {
    status?: string;
    scannedFiles?: number;
    totalFiles?: number;
    totalNodes?: number;
    totalEdges?: number;
    errorMessage?: string;
    completedAt?: Date;
  },
): void {
  const db = getDb();
  db.update(codeScanJobs).set(update).where(eq(codeScanJobs.id, jobId)).run();
}

/** Get latest scan job for a project. */
export function getLatestScanJob(projectSlug: string) {
  const db = getDb();
  return db
    .select()
    .from(codeScanJobs)
    .where(eq(codeScanJobs.projectSlug, projectSlug))
    .orderBy(sql`${codeScanJobs.startedAt} DESC`)
    .limit(1)
    .get();
}
