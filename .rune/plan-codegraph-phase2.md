# Phase 2: Semantic Describer + Diff Updater

## Goal

After Phase 1 populates raw nodes/edges, Phase 2 adds intelligence: Haiku-generated semantic descriptions for every node, and incremental diff-based rescanning so the graph stays current without full rescans.

## Tasks

- [x] Create `packages/server/src/codegraph/semantic-describer.ts` — batch AI description generator
- [x] Create `packages/server/src/codegraph/diff-updater.ts` — git-diff-based incremental rescan
- [x] Update `packages/server/src/codegraph/index.ts` — add describeProject(), incrementalRescan() to public API
- [x] Add "describing" phase to scanProject() — after AST scan, run semantic describer
- [x] Wire diff updater to session lifecycle — trigger after session ends (post-result)
- [ ] Write test for diff-updater with mock git diff output
- [ ] Verify: descriptions generated for all exported nodes in Companion

## Detailed Specs

### semantic-describer.ts

```typescript
import { callAI, isAIConfigured } from "../services/ai-client.js";

interface DescriptionInput {
  nodeId: number;
  symbolName: string;
  symbolType: string;
  signature: string | null;
  bodyPreview: string | null;  // first 10 lines
  filePath: string;
}

interface DescriptionResult {
  nodeId: number;
  description: string;
}

export async function describeNodes(
  nodes: DescriptionInput[],
  opts?: { batchSize?: number; concurrency?: number }
): Promise<DescriptionResult[]>
```

**Strategy:**
1. Filter: only describe exported nodes and endpoints (skip internal helpers to save cost)
2. Batch: group 5-10 nodes per AI call (one prompt with multiple items)
3. Prompt template:
```
You are a code documentation assistant. For each symbol below, write a 1-sentence description
of what it DOES (not what it IS). Focus on behavior and purpose.

Format: Return a JSON array of objects with "index" and "description" fields.

Symbols:
1. [function] validateToken(token: string): Promise<User | null>
   File: packages/server/src/services/auth.ts
   Body: const decoded = jwt.verify(token, secret); ...

2. [component] SessionPanel(props: { sessionId: string })
   File: packages/web/src/app/sessions/components/session-panel.tsx
   Body: const session = useSessionStore(...); return <div>...
```
4. Parse AI response as JSON, map descriptions back to node IDs
5. Update code_nodes.description via graph-store
6. If AI is not configured (isAIConfigured() returns false), skip silently — descriptions remain null
7. Cost estimate: ~85 files * ~3 exports avg = ~255 nodes / 5 per batch = ~51 API calls * ~500 tokens = ~25k tokens total (~$0.006 with Haiku)

**Error handling:**
- If AI call fails for a batch, log warning and continue with next batch
- If JSON parse fails, try regex extraction as fallback
- Never block or throw — descriptions are optional enrichment

### diff-updater.ts

```typescript
import { execSync } from "child_process";

export interface DiffResult {
  added: string[];      // new files
  modified: string[];   // changed files
  deleted: string[];    // removed files
}

export function getGitDiff(projectDir: string, since?: string): DiffResult
// Runs: git diff HEAD~1 --name-status --no-renames
// Or if since is provided: git diff <since> --name-status
// Parses output into added/modified/deleted arrays
// Falls back to empty result if not a git repo or git fails

export async function incrementalRescan(
  projectSlug: string,
  changedFiles?: string[]   // override: specific files to rescan (from session result)
): Promise<{ updated: number; added: number; deleted: number }>
```

**incrementalRescan() algorithm:**
```
1. If changedFiles provided, use those. Otherwise, call getGitDiff().
2. For deleted files:
   a. deleteFileData(projectSlug, filePath) — cascading delete removes nodes + edges
3. For added + modified files:
   a. Read file, compute hash
   b. If hash matches existing code_files record -> skip
   c. Delete old nodes/edges for this file (fresh scan)
   d. scanFile() with @swc/core
   e. Upsert file record
   f. Bulk insert new nodes
4. Second pass: re-resolve edges for all modified files
   - Need the global node lookup (load from DB for the project)
   - Insert new edges with trust weights
5. Mark dependent nodes as "potentially stale":
   - For each deleted/modified node, find edges where it was a target
   - Temporarily reduce trust weight by 0.1 on those edges
   - These will recover on next full scan or when the dependent is rescanned
6. Re-describe changed nodes (if AI configured):
   - Only nodes whose file_hash changed
   - Run semantic describer on just those nodes
7. Return counts
```

**Trigger points for incrementalRescan:**
1. **After session end** (ws-bridge.ts `handleCLIExit`): if session had files_modified > 0
2. **Manual API call**: POST /api/codegraph/rescan (Phase 4)
3. **Future: file watcher** (out of scope for Phase 2, but design allows it)

### Updates to index.ts

```typescript
// Add to existing public API:

export async function describeProject(projectSlug: string): Promise<number>
// 1. Load all nodes with description IS NULL and is_exported = true
// 2. Run semantic describer in batches
// 3. Return count of descriptions generated

export async function incrementalRescan(
  projectSlug: string,
  changedFiles?: string[]
): Promise<{ updated: number; added: number; deleted: number }>
// Delegates to diff-updater.ts

// Update scanProject() to include description phase:
// After AST scanning is done -> update scan job status to "describing"
// -> run describeProject() -> update scan job status to "done"
```

### Integration with ws-bridge.ts

In `handleCLIExit()` method (around line 540-566 of ws-bridge.ts):

```typescript
// After: void summarizeSession(sessionId);
// Add:
const record = getSessionRecord(sessionId);
if (record?.projectSlug) {
  const modified = record.filesModified as string[] ?? [];
  const created = record.filesCreated as string[] ?? [];
  const changed = [...modified, ...created];
  if (changed.length > 0) {
    // Non-blocking incremental rescan
    void incrementalRescan(record.projectSlug, changed).then((result) => {
      log.info("CodeGraph incremental rescan", { projectSlug: record.projectSlug, ...result });
    }).catch((err) => {
      log.warn("CodeGraph rescan failed", { error: String(err) });
    });
  }
}
```

## Files Touched

- `packages/server/src/codegraph/semantic-describer.ts` — new
- `packages/server/src/codegraph/diff-updater.ts` — new
- `packages/server/src/codegraph/index.ts` — modify (add describeProject, incrementalRescan)
- `packages/server/src/services/ws-bridge.ts` — modify (add rescan trigger in handleCLIExit, ~3 lines)
- `packages/server/src/codegraph/__tests__/diff-updater.test.ts` — new

## Dependencies

- Phase 1 complete (scanner + store working)
- `ai-client.ts` exists and works (already in codebase)

## Acceptance Criteria

- [ ] `describeProject("companion")` generates descriptions for exported nodes
- [ ] Descriptions are coherent 1-sentence summaries (manually verify 5-10)
- [ ] Cost of describing Companion project < $0.05
- [ ] If AI is not configured, describer skips silently (no errors)
- [ ] `getGitDiff()` correctly parses added/modified/deleted files
- [ ] `incrementalRescan()` only re-scans changed files (not full project)
- [ ] After session end with file modifications, graph is updated automatically
- [ ] Deleted files are removed from graph (cascading delete works)
- [ ] Modified file: old nodes removed, new nodes inserted, edges re-resolved
- [ ] Re-scan of 3 files completes in < 2 seconds
