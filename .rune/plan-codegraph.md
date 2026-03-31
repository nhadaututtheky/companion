# Feature: CodeGraph — Persistent Code Intelligence Engine

## Overview

CodeGraph builds a weighted directed graph of every symbol in a connected project's codebase. Nodes are files/functions/classes/types/components/endpoints. Edges are imports/calls/extends/renders/routes-to with trust weights (0.0-1.0). Semantic descriptions are generated via the AI client (Haiku tier). The graph powers 4 agent injection points: project map on session start, contextual pre-injection per message, plan validation, and break-check after edits.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Scanner + Store | ⬚ Pending | plan-codegraph-phase1.md | Drizzle schema, @swc/core scanner, graph store CRUD |
| 2 | Semantic + Diff | ⬚ Pending | plan-codegraph-phase2.md | Haiku descriptions, incremental diff updater, file watcher |
| 3 | Agent Interface | ⬚ Pending | plan-codegraph-phase3.md | 4 injection points into ws-bridge.ts message flow |
| 4 | API + Web UI | ⬚ Pending | plan-codegraph-phase4.md | REST routes, graph visualization panel |

## Key Decisions

- **AST parser**: tree-sitter via `web-tree-sitter` + `tree-sitter-wasms` (WASM, 36 languages) — replaces @swc/core for multi-language support. contextplus proved this works well in MCP/Node context. Fallback: regex extraction for unsupported languages
- **Storage**: Same SQLite DB via Drizzle (companion.db) — no separate graph DB
- **Semantic AI**: Uses existing `ai-client.ts` callAI() with tier="fast" — provider-agnostic
- **Embeddings**: Optional Ollama `nomic-embed-text` for semantic search (inspired by contextplus). If Ollama unavailable, fall back to keyword search only
- **Scan trigger**: Background on project connect + incremental on git diff detection
- **Trust weights**: Static rules (import+call=0.9, type-only=0.5, test=0.7) — no ML
- **Context budget**: Project map max 1500 tokens, per-message context max 800 tokens. Dynamic pruning (contextplus pattern: symbols → headers → filenames in 3 tiers based on token budget)
- **No blocking**: All scans run async, never block session start or message flow
- **Blast radius**: Cross-file symbol usage tracing via word-boundary regex scan (contextplus `get_blast_radius` pattern — fast and sufficient for plan validation)
- **WebIntel bridge**: When CodeGraph detects unknown external imports, hand off to WebIntel for auto doc resolution

## contextplus Reference

contextplus (github.com/ForLoopCodes/contextplus, MIT, 1.7k stars) solved many of the same problems:
- tree-sitter WASM for 36-language AST parsing — **adopt this over @swc/core**
- Token-budget-aware context trees (3-tier pruning) — **adopt this pattern**
- Blast radius via regex word-boundary scan — **adopt for plan validation**
- Spectral clustering for code neighborhoods — **evaluate for Phase 4 UI**
- Memory graph with edge decay — **reference for cross-session learning**
- Embedding + hybrid search — **adopt if Ollama available**

Security notes: contextplus has open CWE-78 (command injection) and CWE-22 (path traversal) issues. Do NOT copy `run_static_analysis` or `propose_commit` — build our own with proper validation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CodeGraph Engine                         │
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌───────────────┐          │
│  │ Scanner  │──>│ Graph    │<──│ Diff Updater  │          │
│  │ (SWC)   │   │ Store    │   │ (git diff)    │          │
│  └──────────┘   │ (SQLite) │   └───────────────┘          │
│                 └────┬─────┘                                │
│                      │                                      │
│  ┌──────────────┐    │    ┌─────────────────────────┐      │
│  │ Semantic     │<───┘───>│ Agent Context Provider  │      │
│  │ Describer    │         │ (4 injection points)    │      │
│  │ (AI Client)  │         └─────────────────────────┘      │
│  └──────────────┘                    │                      │
│                                      │                      │
└──────────────────────────────────────┼──────────────────────┘
                                       │
              ┌────────────────────────┼────────────────┐
              │            ws-bridge.ts                  │
              │                                         │
              │  startSession() ──> inject project map  │
              │  handleUserMessage() ──> inject context  │
              │  (plan detection) ──> inject plan review │
              │  handleResult() ──> inject break-check   │
              └─────────────────────────────────────────┘
```

## Drizzle Schema (Exact TypeScript)

```typescript
// packages/server/src/db/schema.ts — ADD these tables

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ─── CodeGraph: Files ─────────────────────────────────────────────────────────

export const codeFiles = sqliteTable("code_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectSlug: text("project_slug").notNull().references(() => projects.slug),
  filePath: text("file_path").notNull(),       // relative to project root
  fileHash: text("file_hash").notNull(),        // SHA-256 of file content
  totalLines: integer("total_lines").notNull().default(0),
  language: text("language").notNull().default("typescript"), // ts, tsx, js, jsx, json, css
  description: text("description"),             // Haiku-generated 1-liner
  lastScannedAt: integer("last_scanned_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  scanVersion: integer("scan_version").notNull().default(1),
}, (table) => [
  index("idx_code_files_project").on(table.projectSlug),
  index("idx_code_files_path").on(table.projectSlug, table.filePath),
]);

// ─── CodeGraph: Nodes (symbols) ──────────────────────────────────────────────

export const codeNodes = sqliteTable("code_nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectSlug: text("project_slug").notNull().references(() => projects.slug),
  fileId: integer("file_id").notNull().references(() => codeFiles.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),       // denormalized for fast queries
  symbolName: text("symbol_name").notNull(),
  symbolType: text("symbol_type").notNull(),    // function, class, interface, type, const, component, endpoint, hook
  signature: text("signature"),                 // e.g. "(order: Order, method: PaymentMethod): Promise<Receipt>"
  description: text("description"),             // Haiku-generated semantic description
  isExported: integer("is_exported", { mode: "boolean" }).notNull().default(false),
  lineStart: integer("line_start").notNull(),
  lineEnd: integer("line_end").notNull(),
  bodyPreview: text("body_preview"),            // first 10 lines of body (for semantic describer input)
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_code_nodes_project").on(table.projectSlug),
  index("idx_code_nodes_file").on(table.fileId),
  index("idx_code_nodes_symbol").on(table.projectSlug, table.symbolName),
  index("idx_code_nodes_type").on(table.projectSlug, table.symbolType),
]);

// ─── CodeGraph: Edges (relationships) ────────────────────────────────────────

export const codeEdges = sqliteTable("code_edges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectSlug: text("project_slug").notNull(),
  sourceNodeId: integer("source_node_id").notNull().references(() => codeNodes.id, { onDelete: "cascade" }),
  targetNodeId: integer("target_node_id").notNull().references(() => codeNodes.id, { onDelete: "cascade" }),
  edgeType: text("edge_type").notNull(),        // imports, calls, extends, implements, uses_type, renders_component, routes_to, queries_table, tests, configures
  trustWeight: real("trust_weight").notNull().default(0.5),
  context: text("context"),                     // why this edge exists, e.g. "import { validateToken } from './auth'"
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("idx_code_edges_source").on(table.sourceNodeId),
  index("idx_code_edges_target").on(table.targetNodeId),
  index("idx_code_edges_project").on(table.projectSlug),
  index("idx_code_edges_type").on(table.projectSlug, table.edgeType),
]);

// ─── CodeGraph: Scan Jobs ────────────────────────────────────────────────────

export const codeScanJobs = sqliteTable("code_scan_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectSlug: text("project_slug").notNull().references(() => projects.slug),
  status: text("status").notNull().default("pending"),  // pending, scanning, describing, done, error
  totalFiles: integer("total_files").notNull().default(0),
  scannedFiles: integer("scanned_files").notNull().default(0),
  totalNodes: integer("total_nodes").notNull().default(0),
  totalEdges: integer("total_edges").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});
```

## Trust Weight Rules

| Edge Pattern | Weight | Rationale |
|---|---|---|
| `imports` + `calls` (same source calls imported fn) | 0.9 | Tight runtime coupling |
| `imports` only (type import or unused) | 0.5 | Interface coupling |
| `extends` / `implements` | 0.95 | Inheritance = very tight |
| `renders_component` | 0.8 | Component tree coupling |
| `routes_to` (route handler → service) | 0.7 | Layer boundary |
| `uses_type` (only references a type/interface) | 0.4 | Loose contract |
| `queries_table` | 0.6 | Data dependency |
| `tests` (test file → tested module) | 0.7 | Test must update with impl |
| `configures` (config references a module) | 0.3 | Loose runtime link |
| Transitive A→B→C | product: w(A→B) * w(B→C) | Decay through layers |

## Scanner Design (@swc/core)

### File Discovery
```
1. Read project dir from `projects.dir`
2. Respect .gitignore via `ignore` npm package
3. Filter: *.ts, *.tsx, *.js, *.jsx (skip node_modules, dist, .git, .next)
4. Hash each file (SHA-256) for change detection
```

### AST Extraction Per File (using @swc/core parseSync)
```
For each file:
  1. parseSync(code, { syntax: "typescript", tsx: true })
  2. Walk AST module.body:
     - ExportDeclaration / ExportDefaultDeclaration → extract exported symbol
     - FunctionDeclaration → Node(type=function, signature from params+returnType)
     - ClassDeclaration → Node(type=class) + scan members for methods
     - TsInterfaceDeclaration → Node(type=interface)
     - TsTypeAliasDeclaration → Node(type=type)
     - VariableDeclaration with ArrowFunction → Node(type=function or component if JSX return)
     - ImportDeclaration → Edge(imports, from source to each imported specifier)
  3. Walk function bodies (CallExpression):
     - If callee matches an imported symbol → Edge(calls)
     - If callee is a known hook (useState, useEffect, etc.) → annotate node
  4. Detect React components:
     - Function returning JSXElement → Node(type=component)
     - JSXElement children → Edge(renders_component)
  5. Detect API routes (Hono pattern):
     - app.get/post/put/delete("/path", handler) → Node(type=endpoint, signature="/path METHOD")
     - Handler referencing service → Edge(routes_to)
  6. Detect DB queries:
     - db.select/insert/update/delete().from(tableName) → Edge(queries_table)
```

### Performance Strategy
- Use @swc/core parseSync (not async — Bun is single-threaded, sync is faster for sequential file processing)
- Process files in batches of 50 to avoid memory spikes
- Target: 10,000 LOC in < 5 seconds (SWC parses ~100k lines/sec)
- Write nodes/edges to DB in bulk (batch INSERT via transaction)

## Agent Interface — 4 Injection Points

### A. Session Start: Project Map (ws-bridge.ts line ~492-503)

**Integration point**: `startSessionWithCli()` method, after `buildSessionContext()`, before sending the initial NDJSON prompt.

**Current flow** (line 493-503 of ws-bridge.ts):
```typescript
const summaryContext = buildSummaryInjection(opts.projectSlug);
const sessionContext = buildSessionContext({ ... });
const fullPrompt = `${opts.prompt}${summaryContext ?? ""}${sessionContext}`;
```

**New flow**:
```typescript
const summaryContext = buildSummaryInjection(opts.projectSlug);
const sessionContext = buildSessionContext({ ... });
const codeGraphMap = await buildProjectMap(opts.projectSlug);  // NEW
const fullPrompt = `${opts.prompt}${summaryContext ?? ""}${sessionContext}${codeGraphMap ?? ""}`;
```

**buildProjectMap()** output (max 1500 tokens):
```xml
<codegraph type="project-map">
Project: Companion (85 files, 7800 LOC)
Architecture: Bun+Hono server -> WebSocket -> Claude CLI
Entry points: src/index.ts (HTTP+WS), telegram/bot-factory.ts (Telegram)

Key modules:
- ws-bridge.ts: Core message router (42 dependents, DANGER)
- session-store.ts: Session CRUD + persistence (18 dependents)
- cli-launcher.ts: Spawns Claude CLI (3 dependents, DANGER)
- ai-client.ts: Multi-provider AI abstraction (8 dependents)

Layer map:
  routes/ -> services/ -> db/ (clean 3-layer)
  telegram/ -> services/ (bridges to same core)

Recent changes (3d): auth middleware, budget enforcement, session config
Hot files: ws-bridge.ts (most edges), session-store.ts (most imports)
</codegraph>
```

### B. Per-Message Context (ws-bridge.ts line ~1550-1556)

**Integration point**: `handleUserMessage()` method, just before the NDJSON is sent to CLI stdin.

**Current flow** (line 1550-1556):
```typescript
// CLI engine path: send NDJSON to stdin
const ndjson = JSON.stringify({
  type: "user",
  message: { role: "user", content },
});
this.sendToCLI(session, ndjson);
```

**New flow**:
```typescript
// Analyze message intent and inject relevant code context
const codeContext = await buildMessageContext(projectSlug, content);
const enrichedContent = codeContext
  ? `${content}\n\n${codeContext}`
  : content;

const ndjson = JSON.stringify({
  type: "user",
  message: { role: "user", content: enrichedContent },
});
this.sendToCLI(session, ndjson);
```

**buildMessageContext()** strategy:
1. Extract keywords from user message (file names, function names, concepts)
2. Query codeNodes by symbolName LIKE or description FTS
3. For top 3-5 matches, fetch their edges (imports, imported-by, calls, called-by)
4. Format as compact XML (max 800 tokens)
5. Cache result per (projectSlug + messageHash) for 60 seconds

**Important**: This must be async but FAST (< 200ms). If CodeGraph is not ready (scan in progress), skip injection silently.

### C. Plan Validation (ws-bridge.ts — handleAssistant)

**Integration point**: `handleAssistant()` method, when detecting an assistant message that contains a plan (file list).

**Detection heuristic**: Assistant message contains patterns like:
- "Files to modify:" or "I'll edit these files:"
- Markdown with file paths (e.g., `src/services/auth.ts`)
- Tool use blocks for Read/Edit/Write tools

**New behavior**: After broadcasting the assistant message, run async plan review:
```typescript
// In handleAssistant(), after broadcasting:
if (hasPlanIndicators(assistantText)) {
  const review = await reviewPlan(projectSlug, extractFilePaths(assistantText));
  if (review) {
    // Inject as a system-level hint (prepend to next user message, or inject as separate message)
    session.pendingCodeGraphHint = review;
  }
}
```

**reviewPlan()** output:
```xml
<codegraph type="plan-review">
Your plan modifies auth.ts but doesn't include:
- middleware/auth.ts (trust: 0.9) -- calls validateToken(), may need update
- routes/sessions.ts (trust: 0.7) -- uses AuthResult type
Consider adding these to your plan.
</codegraph>
```

### D. Break Check (ws-bridge.ts — handleResult or post-edit detection)

**Integration point**: After detecting file modifications via the `result` message or `tool_use` blocks (Write/Edit tools).

**Detection**: When CLI reports files_modified in result message, or when we detect Write/Edit tool_use blocks in assistant messages.

**New behavior**:
```typescript
// In handleResult(), after updating session state:
if (resultMsg.total_lines_added > 0 || resultMsg.total_lines_removed > 0) {
  const modifiedFiles = session.state.files_modified;
  const breakCheck = await checkBreaks(projectSlug, modifiedFiles);
  if (breakCheck) {
    // Queue for next user turn (don't interrupt current flow)
    session.pendingCodeGraphHint = breakCheck;
  }

  // Also trigger incremental rescan of modified files (non-blocking)
  void incrementalRescan(projectSlug, modifiedFiles);
}
```

**checkBreaks()** logic:
1. For each modified file, re-scan AST quickly
2. Compare old exports vs new exports
3. If any export was removed/renamed, query codeEdges for dependents
4. Report broken imports

## File Structure (New Files)

```
packages/server/src/
  codegraph/
    index.ts                   — public API: scanProject, getProjectMap, getMessageContext, etc.
    scanner.ts                 — @swc/core AST scanner, extracts nodes + edges
    graph-store.ts             — Drizzle CRUD for code_files, code_nodes, code_edges
    semantic-describer.ts      — Batch AI descriptions via ai-client.ts
    diff-updater.ts            — Incremental rescan on git diff
    agent-context-provider.ts  — buildProjectMap, buildMessageContext, reviewPlan, checkBreaks
    trust-calculator.ts        — Edge weight rules + transitive calculation
    utils.ts                   — File hashing, gitignore filtering, keyword extraction

packages/server/src/routes/
    codegraph.ts               — REST API routes for status, search, impact, graph

packages/web/src/app/codegraph/
    page.tsx                   — CodeGraph dashboard page
    components/
      graph-panel.tsx          — Force-directed graph visualization
      node-detail.tsx          — Node inspector sidebar
      scan-status.tsx          — Scan progress indicator
      impact-view.tsx          — Impact radius visualization
```

## Migration File

```sql
-- packages/server/src/db/migrations/0009_codegraph.sql

CREATE TABLE IF NOT EXISTS code_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL REFERENCES projects(slug),
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  total_lines INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'typescript',
  description TEXT,
  last_scanned_at INTEGER NOT NULL,
  scan_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_code_files_project ON code_files(project_slug);
CREATE UNIQUE INDEX idx_code_files_path ON code_files(project_slug, file_path);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS code_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL REFERENCES projects(slug),
  file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL,
  signature TEXT,
  description TEXT,
  is_exported INTEGER NOT NULL DEFAULT 0,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  body_preview TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_code_nodes_project ON code_nodes(project_slug);
CREATE INDEX idx_code_nodes_file ON code_nodes(file_id);
CREATE INDEX idx_code_nodes_symbol ON code_nodes(project_slug, symbol_name);
CREATE INDEX idx_code_nodes_type ON code_nodes(project_slug, symbol_type);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS code_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL,
  source_node_id INTEGER NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES code_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,
  trust_weight REAL NOT NULL DEFAULT 0.5,
  context TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_code_edges_source ON code_edges(source_node_id);
CREATE INDEX idx_code_edges_target ON code_edges(target_node_id);
CREATE INDEX idx_code_edges_project ON code_edges(project_slug);
CREATE INDEX idx_code_edges_type ON code_edges(project_slug, edge_type);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS code_scan_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL REFERENCES projects(slug),
  status TEXT NOT NULL DEFAULT 'pending',
  total_files INTEGER NOT NULL DEFAULT 0,
  scanned_files INTEGER NOT NULL DEFAULT 0,
  total_nodes INTEGER NOT NULL DEFAULT 0,
  total_edges INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
```
