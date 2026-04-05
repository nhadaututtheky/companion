# Phase 3: Incremental Edge Resolution (Kill O(n²))

## Goal
Current `diff-updater.ts` deletes ALL edges for the entire project and re-scans ALL files on every incremental update — even if only 1 file changed. This is O(n²) where n = total files. Replace with O(k×m) where k = changed files and m = average edges per file.

## Pre-requisites
- Phase 1 complete (Tree-sitter scanner)
- Phase 2 complete (call graph edges — more edge types means bigger O(n²) pain)

## Context: The Problem (diff-updater.ts lines 229-291)
```typescript
// Current code — THE BOTTLENECK:
if (rescannedFileIds.length > 0) {
  // 1. Delete ALL edges for entire project
  deleteEdgesForProject(projectSlug);

  // 2. Load ALL nodes
  const allNodes = getProjectNodes(projectSlug);
  
  // 3. Re-scan ALL files to extract edges
  const allFiles = db.select(...).from(codeFiles).where(...).all();
  for (const file of allFiles) {
    const code = readFileSync(absPath, "utf-8");
    const result = scanFile(code, file.filePath, file.language);
    // ... resolve edges against allNodes
  }
}
```

Even if 1 file changed, this re-reads and re-parses EVERY file in the project. For a 500-file project, that's 500 file reads + 500 parses just to update 1 file's edges.

## Tasks
- [ ] Add `deleteEdgesForFile(projectSlug, fileId)` to `graph-store.ts`:
  - Delete edges where `sourceNodeId` belongs to the file (outgoing)
  - Delete edges where `targetNodeId` belongs to the file (incoming from other files)
  - SQL: `DELETE FROM code_edges WHERE project_slug = ? AND (source_node_id IN (SELECT id FROM code_nodes WHERE file_id = ?) OR target_node_id IN (SELECT id FROM code_nodes WHERE file_id = ?))`
- [ ] Add `getNodesByFileId(fileId)` to `graph-store.ts` (if not already available)
- [ ] Add `getNodesForFiles(projectSlug, fileIds)` for batch lookup
- [ ] Modify `diff-updater.ts` incremental edge resolution:
  - **Step 1**: For each changed file, delete ONLY that file's edges (outgoing + incoming to that file's nodes)
  - **Step 2**: Re-scan ONLY the changed files to extract new edges
  - **Step 3**: Resolve new edges against the full node set (still need full node lookup for targets)
  - **Step 4**: For files that imported the changed file, also re-resolve THEIR edges to the changed file's new nodes
    - Get reverse dependencies of changed file (who imports it?)
    - Re-scan those dependents' edges that point to changed file's nodes
    - This is O(k × d) where d = average dependents per changed file (typically <10)
- [ ] Handle node renaming / removal:
  - If a changed file REMOVES a symbol that other files import → those edges become dangling
  - After re-resolving, check for edges pointing to non-existent nodes → delete them
  - This catches: renamed exports, removed functions, restructured modules
- [ ] Add `resolveEdgesForFile()` helper:
  ```typescript
  async function resolveEdgesForFile(
    projectSlug: string,
    fileId: number, 
    filePath: string,
    projectDir: string,
    nodesByName: Map<string, NodeRow>,
  ): Promise<EdgeRecord[]>
  ```
  - Reads the file, scans with Tree-sitter, resolves edges against nodesByName
  - Used for both changed files and their dependents
- [ ] Performance optimization — build nodesByName index ONCE per rescan batch:
  - `const allNodes = getProjectNodes(projectSlug)`
  - `const nodesByName = new Map(allNodes.map(n => [n.symbolName, n]))`
  - Pass to all resolution calls
  - This is O(n) to build but avoids repeated DB queries
- [ ] Add `resolveEdgesIncremental()` as top-level function:
  ```typescript
  async function resolveEdgesIncremental(
    projectSlug: string,
    changedFileIds: number[],
    projectDir: string,
  ): Promise<number>
  ```
  - Returns count of resolved edges
  - Replaces the O(n²) block in `incrementalRescan()`
- [ ] TypeScript compiles clean
- [ ] Benchmark: measure rescan time before/after on Companion's own codebase (~85 files)

## Algorithm Detail

### Before (O(n²)):
```
1 file changed → delete 500 files' edges → re-scan 500 files → resolve 500 files' edges
```

### After (O(k×d)):
```
1 file changed →
  1. Delete changed file's edges only
  2. Re-scan changed file → extract new edges → resolve against full node index
  3. Find dependents of changed file (who imports it?) — typically 5-10 files
  4. For each dependent: delete edges pointing TO changed file's OLD nodes, re-resolve against NEW nodes
  5. Clean up any dangling edges
```

### Edge Case: Node Rename
```
File A exports `createFoo()`, File B imports it.
User renames to `buildFoo()`.

Step 1: Delete A's outgoing edges + edges targeting A's nodes
Step 2: Re-scan A → new node `buildFoo`, edge resolution succeeds for A's imports
Step 3: Find dependents of A → [File B]
Step 4: Re-scan B's edges → B still has `import { createFoo }` → no match in nodesByName → edge NOT created
Step 5: This is correct! B's import is now broken, and the graph reflects that.

When B is later edited to fix the import → incremental rescan picks it up.
```

### Edge Case: File Deletion
```
File A deleted.
Step 1: CASCADE delete removes A's nodes + all edges from/to A's nodes (already handled by diff-updater)
No additional edge resolution needed.
```

## Acceptance Criteria
- [ ] Incremental rescan with 1 changed file does NOT re-read all project files
- [ ] Edge count after incremental rescan matches full rescan (correctness check)
- [ ] Dangling edges are cleaned up when symbols are removed
- [ ] Dependents of changed files get their edges updated
- [ ] Performance: 1-file rescan < 500ms for 500-file project (was potentially seconds)
- [ ] TypeScript compiles clean
- [ ] No regression in full scan path (first-time scan still works)

## Files Touched
- `packages/server/src/codegraph/graph-store.ts` — modify (add deleteEdgesForFile, getNodesByFileId)
- `packages/server/src/codegraph/diff-updater.ts` — major modify (replace O(n²) with incremental)

## Dependencies
- Phase 1 (Tree-sitter scanner — needed for `scanFileAsync`)
- Phase 2 (call graph — more edge types to resolve correctly)
