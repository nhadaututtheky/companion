# Phase 3: Agent Context Provider (4 Injection Points)

## Goal

Wire CodeGraph intelligence into the agent message flow. This is the most impactful phase — it makes every Claude session smarter by injecting relevant code context, validating plans, and warning about breaking changes.

## Tasks

- [x] Create `packages/server/src/codegraph/agent-context-provider.ts` — all 4 injection functions
- [x] Modify `packages/server/src/services/ws-bridge.ts` — inject points A (startSession), B (handleUserMessage), C (handleAssistant), D (handleResult)
- [x] Add `pendingCodeGraphHint` field to ActiveSession type in session-store.ts
- [x] Create `packages/server/src/codegraph/query-engine.ts` — graph traversal (BFS impact radius, reverse dependency lookup)
- [ ] Write integration test: verify context injection in message flow
- [ ] Performance test: context generation < 200ms for all 4 injection types

## Detailed Specs

### query-engine.ts

```typescript
// Graph traversal utilities for CodeGraph queries

export interface ImpactNode {
  nodeId: number;
  symbolName: string;
  filePath: string;
  symbolType: string;
  description: string | null;
  distance: number;          // BFS distance from source
  cumulativeTrust: number;   // product of trust weights along path
}

export function getImpactRadius(
  projectSlug: string,
  filePath: string,
  opts?: { maxDepth?: number; minTrust?: number }
): ImpactNode[]
// BFS from all nodes in filePath, following outgoing edges
// Default: maxDepth=2, minTrust=0.3
// Returns nodes sorted by cumulativeTrust DESC

export function getReverseDependencies(
  projectSlug: string,
  filePath: string
): ImpactNode[]
// Follow INCOMING edges to find "who depends on this file"
// Critical for break-check (injection point D)

export function getRelatedNodes(
  projectSlug: string,
  keywords: string[],
  limit?: number
): CodeNodeWithEdges[]
// Search by symbol name or description
// For each match, include top 3 incoming + outgoing edges
// Used by injection point B (message context)

export function getHotFiles(projectSlug: string, limit?: number): {
  filePath: string;
  incomingEdges: number;
  outgoingEdges: number;
  totalTrust: number;
}[]
// Files with most edges = highest coupling = most impactful to change
// Used by injection point A (project map)
```

### agent-context-provider.ts

```typescript
// ─── Injection Point A: Project Map ─────────────────────────────────────────

export async function buildProjectMap(projectSlug: string): Promise<string | null>
// Returns null if graph not ready (no scan completed)
// Max output: 1500 tokens (~600 words)
//
// Algorithm:
// 1. getProjectStats() for file/node/edge counts
// 2. getHotFiles(limit=8) for key modules
// 3. Detect layers from file paths (routes/, services/, db/, telegram/)
// 4. Get recent scan job for "last scanned" timestamp
// 5. Format as <codegraph type="project-map"> XML block

// ─── Injection Point B: Message Context ─────────────────────────────────────

export async function buildMessageContext(
  projectSlug: string,
  userMessage: string
): Promise<string | null>
// Returns null if graph not ready or no relevant nodes found
// Max output: 800 tokens (~320 words)
//
// Algorithm:
// 1. Extract keywords from userMessage (file names, function names, concepts)
// 2. Also extract explicit file paths mentioned (regex: [\w/.-]+\.(ts|tsx|js))
// 3. getRelatedNodes(keywords, limit=5)
// 4. For each matched node:
//    a. Include: file path, description, signature
//    b. Include: top 3 "imported by" (who depends on this)
//    c. Include: impact radius count
// 5. Format as <codegraph type="context"> XML block
//
// Caching: memoize by (projectSlug + hash(keywords)) for 60 seconds
// Performance: must complete in < 200ms (DB queries only, no AI calls)

// ─── Injection Point C: Plan Review ─────────────────────────────────────────

export async function reviewPlan(
  projectSlug: string,
  mentionedFiles: string[]
): Promise<string | null>
// Returns null if no gaps found
//
// Algorithm:
// 1. For each mentioned file, get all nodes
// 2. For each node, get reverse dependencies (who depends on it)
// 3. Collect all dependent files NOT in mentionedFiles
// 4. Filter by trust weight > 0.5 (only significant dependencies)
// 5. If any missing dependent files found, format warning
// 6. Format as <codegraph type="plan-review"> XML block

// ─── Injection Point D: Break Check ─────────────────────────────────────────

export async function checkBreaks(
  projectSlug: string,
  modifiedFiles: string[]
): Promise<string | null>
// Returns null if no breaks detected
//
// Algorithm:
// 1. For each modified file:
//    a. Get OLD nodes from DB (before rescan — so call BEFORE incrementalRescan)
//    b. Quick-scan the new file content with scanFile()
//    c. Compare old exports vs new exports
//    d. For removed/renamed exports: find all incoming edges (who imports this)
// 2. Collect broken imports
// 3. Format as <codegraph type="break-check"> XML block

// ─── Helper: Extract File Paths from Text ────────────────────────────────────

export function extractFilePaths(text: string): string[]
// Regex: match patterns like `src/services/auth.ts` or `packages/server/src/...`
// Also match markdown code blocks with file paths
// Deduplicate and return

// ─── Helper: Detect Plan Indicators ──────────────────────────────────────────

export function hasPlanIndicators(text: string): boolean
// Returns true if text contains patterns like:
// - "Files to modify:", "I'll edit", "Plan:", "I'll create"
// - Multiple file paths in a list format
// - Tool use blocks for Write/Edit/Read
```

### Modifications to ws-bridge.ts

**Import additions** (top of file, ~line 11):
```typescript
import { buildProjectMap, buildMessageContext, reviewPlan, checkBreaks, hasPlanIndicators, extractFilePaths } from "../codegraph/agent-context-provider.js";
import { isGraphReady } from "../codegraph/index.js";
```

**Injection Point A — startSessionWithCli()** (line ~493):
```typescript
// BEFORE (current):
const summaryContext = buildSummaryInjection(opts.projectSlug);
const sessionContext = buildSessionContext({ ... });
const fullPrompt = `${opts.prompt}${summaryContext ?? ""}${sessionContext}`;

// AFTER:
const summaryContext = buildSummaryInjection(opts.projectSlug);
const sessionContext = buildSessionContext({ ... });
// CodeGraph project map (non-blocking, skip if not ready)
let codeGraphMap = "";
if (opts.projectSlug && isGraphReady(opts.projectSlug)) {
  try {
    codeGraphMap = await buildProjectMap(opts.projectSlug) ?? "";
  } catch (err) {
    log.warn("CodeGraph map failed", { error: String(err) });
  }
}
const fullPrompt = `${opts.prompt}${summaryContext ?? ""}${sessionContext}${codeGraphMap}`;
```

Note: startSessionWithCli needs to become async, or project map must be built synchronously from cached data. Recommend: cache the project map on scan completion and read from cache here (sync). Alternatively, build it during the 1-second delay before sending prompt.

**Injection Point B — handleUserMessage()** (line ~1550):
```typescript
// BEFORE (current):
const ndjson = JSON.stringify({
  type: "user",
  message: { role: "user", content },
});

// AFTER:
let enrichedContent = content;

// Prepend any pending CodeGraph hint from previous turn (plan-review or break-check)
if (session.pendingCodeGraphHint) {
  enrichedContent = `${session.pendingCodeGraphHint}\n\n${content}`;
  session.pendingCodeGraphHint = undefined;
}

// Inject relevant code context (non-blocking, skip if slow)
const record = getSessionRecord(session.id);
const slug = record?.projectSlug;
if (slug && isGraphReady(slug)) {
  try {
    const ctx = await buildMessageContext(slug, content);
    if (ctx) {
      enrichedContent = `${enrichedContent}\n\n${ctx}`;
    }
  } catch { /* silently skip */ }
}

const ndjson = JSON.stringify({
  type: "user",
  message: { role: "user", content: enrichedContent },
});
```

**IMPORTANT**: handleUserMessage is currently sync. Making it async requires care:
- Option 1: Make it async, await context generation (adds ~100-200ms latency)
- Option 2: Fire-and-forget context injection (complex, risk of race conditions)
- **Recommended**: Option 1. 200ms is acceptable. User won't notice on typing flow.
- The method already calls async operations indirectly (storeMessage, handleMentions)

**Injection Point C — handleAssistant()** (around line ~780-820):
```typescript
// AFTER broadcasting assistant message to browsers, add:
const record = getSessionRecord(session.id);
const slug = record?.projectSlug;
if (slug && isGraphReady(slug)) {
  const text = extractTextFromContentBlocks(msg.message.content);
  if (hasPlanIndicators(text)) {
    const files = extractFilePaths(text);
    if (files.length > 0) {
      void reviewPlan(slug, files).then((hint) => {
        if (hint) {
          session.pendingCodeGraphHint = hint;
          log.info("CodeGraph plan review hint queued", { sessionId: session.id, files: files.length });
        }
      }).catch(() => { /* silently skip */ });
    }
  }
}
```

**Injection Point D — handleResult()** (around line ~830-870):
```typescript
// AFTER updating session state with result data, add:
const record = getSessionRecord(session.id);
const slug = record?.projectSlug;
if (slug && isGraphReady(slug) && session.state.files_modified.length > 0) {
  void checkBreaks(slug, session.state.files_modified).then((hint) => {
    if (hint) {
      session.pendingCodeGraphHint = hint;
      log.info("CodeGraph break-check hint queued", { sessionId: session.id });
    }
  }).catch(() => { /* silently skip */ });
}
```

### Modifications to session-store.ts

Add to `ActiveSession` interface (around line ~57):
```typescript
/** Pending CodeGraph context hint to prepend to next user message */
pendingCodeGraphHint?: string;
```

### SDK Engine path

The same injection points apply to the SDK engine path in `startSessionWithSdk()` and the SDK message flow. The implementation is analogous — the SDK path uses `opts.prompt` similarly. Inject project map into the initial prompt, and message context into subsequent prompts via the resume flow.

## Files Touched

- `packages/server/src/codegraph/query-engine.ts` — new
- `packages/server/src/codegraph/agent-context-provider.ts` — new
- `packages/server/src/services/ws-bridge.ts` — modify (4 injection points, ~30 lines added)
- `packages/server/src/services/session-store.ts` — modify (add pendingCodeGraphHint to ActiveSession)
- `packages/server/src/codegraph/__tests__/agent-context.test.ts` — new

## Dependencies

- Phase 1 complete (scanner + store)
- Phase 2 complete (descriptions available for rich context)
- Phase 2 is soft dependency — injection points work without descriptions (just less informative)

## Acceptance Criteria

- [ ] **A**: New session prompt includes `<codegraph type="project-map">` block
- [ ] **A**: Project map lists top 8 hot files with correct edge counts
- [ ] **B**: User message mentioning "auth" injects context about auth.ts and its dependents
- [ ] **B**: Context injection completes in < 200ms
- [ ] **B**: If graph not ready, injection is silently skipped (no errors, no delay)
- [ ] **C**: When assistant outputs a plan with file list, plan-review hint is queued
- [ ] **C**: Plan review correctly identifies missing dependent files
- [ ] **D**: When session modifies files, break-check runs and detects removed exports
- [ ] **D**: Break-check hint is prepended to next user message
- [ ] All injection points are non-blocking (never delay the critical path by > 200ms)
- [ ] pendingCodeGraphHint is consumed after first use (not repeated)
- [ ] SDK engine path also receives project map injection
