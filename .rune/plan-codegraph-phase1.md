# Phase 1: Scanner + Store

## Goal

Build the foundation: Drizzle schema, migration, tree-sitter WASM scanner that extracts nodes/edges from source files (36 languages), and graph store CRUD. After this phase, running a full scan on a project populates the DB tables.

## Key Change from Original: tree-sitter replaces @swc/core

contextplus (MIT, 1.7k stars) proved that `web-tree-sitter` + `tree-sitter-wasms` works reliably for multi-language AST parsing in a Node/Bun MCP context. Benefits:
- **36 languages** vs @swc/core's TypeScript/JavaScript-only
- **WASM grammars** — no native binaries, works in Docker/any platform
- **Proven patterns** — contextplus's `parser.ts` + `tree-sitter.ts` are battle-tested reference implementations
- **Regex fallback** — for files tree-sitter can't parse, extract basic symbols via regex (contextplus pattern)

Trade-off: tree-sitter is slightly slower than @swc/core for TypeScript specifically, but the multi-language support is essential since Companion handles ANY user project.

## Tasks

### Dependencies
- [ ] Install tree-sitter deps — `cd packages/server && bun add web-tree-sitter tree-sitter-wasms`
- [ ] Install `ignore` package for .gitignore support — `bun add ignore`
- [ ] Verify WASM loading works in Bun (tree-sitter-wasms ships .wasm files, Bun may need special handling)

### Database Schema
- [ ] Add Drizzle schema tables to `packages/server/src/db/schema.ts` (code_files, code_nodes, code_edges, code_scan_jobs)
- [ ] Write migration SQL at `packages/server/src/db/migrations/0009_codegraph.sql`

### Core Modules
- [ ] Create `packages/server/src/codegraph/utils.ts` — file discovery, hashing, gitignore filter, language detection
- [ ] Create `packages/server/src/codegraph/trust-calculator.ts` — edge weight rules
- [ ] Create `packages/server/src/codegraph/graph-store.ts` — bulk insert/upsert/delete for nodes, edges, files
- [ ] Create `packages/server/src/codegraph/scanner.ts` — tree-sitter AST walker + regex fallback
- [ ] Create `packages/server/src/codegraph/index.ts` — public API (scanProject, getScanStatus)

### Testing
- [ ] Write unit test for scanner on a small fixture file
- [ ] Verify: full scan of Companion project itself (~85 files) completes in < 10 seconds

## Detailed Specs

### utils.ts

```typescript
export function discoverFiles(projectDir: string): Promise<string[]>
// - Read .gitignore from projectDir, build ignore filter
// - Walk directory recursively
// - Include: .ts, .tsx, .js, .jsx, .py, .rs, .go, .java, .rb, .vue, .svelte, .css, .json (configurable)
// - Exclude: node_modules, dist, .git, .next, .rune, coverage, __pycache__, target/
// - Return relative paths

export function hashFile(absolutePath: string): string
// - SHA-256 of file content, hex-encoded
// - Use Bun.CryptoHasher for speed

export function detectLanguage(filePath: string): string
// - .ts -> "typescript", .tsx -> "tsx", .py -> "python", .rs -> "rust", etc.
// - Maps to tree-sitter grammar names

export function extractKeywords(text: string): string[]
// - Split on whitespace, camelCase boundaries, dots
// - Filter noise words
// - Return unique lowercase keywords
```

### scanner.ts (tree-sitter based)

```typescript
import Parser from "web-tree-sitter";

// Initialize tree-sitter with WASM grammar for detected language
// Reference: contextplus src/core/tree-sitter.ts for init pattern

export interface ScannedNode {
  symbolName: string;
  symbolType: "function" | "class" | "interface" | "type" | "const" | "component" | "endpoint" | "hook" | "method";
  signature: string | null;
  isExported: boolean;
  lineStart: number;
  lineEnd: number;
  bodyPreview: string | null;  // first 10 lines of function body
}

export interface ScannedEdge {
  sourceSymbol: string;
  targetFilePath: string;
  targetSymbol: string;
  edgeType: EdgeType;
  context: string;
}

export interface ScanResult {
  nodes: ScannedNode[];
  edges: ScannedEdge[];
}

export function scanFile(code: string, filePath: string, language: string): ScanResult

// Tree-sitter query patterns per language:
// TypeScript/JavaScript:
//   (import_statement) → edges
//   (function_declaration name: (identifier)) → nodes
//   (arrow_function) within (variable_declarator name:) → nodes
//   (class_declaration name: (identifier)) → nodes
//   (interface_declaration name: (identifier)) → nodes
//   (type_alias_declaration name: (identifier)) → nodes
//   (call_expression function: (member_expression object: (identifier) @obj property: (property_identifier) @prop))
//     where @obj = "app" and @prop in [get, post, put, delete] → endpoint nodes
//   (jsx_element open_tag: (jsx_opening_element name: (identifier))) → renders_component edges
//
// Python:
//   (import_statement) / (import_from_statement) → edges
//   (function_definition name: (identifier)) → nodes
//   (class_definition name: (identifier)) → nodes
//   (decorated_definition) → check for @app.route etc → endpoint nodes
//
// Rust:
//   (use_declaration) → edges
//   (function_item name: (identifier)) → nodes
//   (struct_item name: (type_identifier)) → nodes
//   (impl_item) → method nodes + edges
//
// Fallback (regex):
//   /^export\s+(function|class|interface|type|const)\s+(\w+)/gm → nodes
//   /^import\s+.*\s+from\s+['"](.+)['"]/gm → edges
```

### trust-calculator.ts

Same as original plan — no changes needed.

### graph-store.ts

Same as original plan — no changes needed.

### index.ts (public API)

```typescript
export async function scanProject(projectSlug: string): Promise<number>
// 1. Get project dir from projects table
// 2. Create scan job (status=scanning)
// 3. Discover files via discoverFiles()
// 4. Initialize tree-sitter parsers for detected languages
// 5. For each file (batches of 50):
//    a. Read file content
//    b. Hash file
//    c. Check if code_files has same hash -> skip if unchanged
//    d. Parse with scanFile() (tree-sitter or regex fallback)
//    e. Upsert file, bulk insert nodes
//    f. Update scan job progress
// 6. Second pass: resolve edges (match imported symbols to actual node IDs)
// 7. Bulk insert edges with trust weights
// 8. Mark scan job done
// Returns: scan job ID

export function getScanStatus(projectSlug: string): ScanJob | null
export function isGraphReady(projectSlug: string): boolean
```

## Files Touched

- `packages/server/src/db/schema.ts` — modify (add 4 tables)
- `packages/server/src/db/migrations/0009_codegraph.sql` — new
- `packages/server/src/codegraph/utils.ts` — new
- `packages/server/src/codegraph/trust-calculator.ts` — new
- `packages/server/src/codegraph/graph-store.ts` — new
- `packages/server/src/codegraph/scanner.ts` — new
- `packages/server/src/codegraph/index.ts` — new
- `packages/server/package.json` — modify (add web-tree-sitter, tree-sitter-wasms, ignore)
- `packages/server/src/codegraph/__tests__/scanner.test.ts` — new

## Dependencies

- None (first phase)

## Acceptance Criteria

- [ ] `bun run` starts without errors (migration applies cleanly)
- [ ] `scanProject("companion")` completes in < 10s for Companion codebase
- [ ] code_files, code_nodes, code_edges tables populated with data
- [ ] Node count > 100 (Companion has ~85 files with multiple exports each)
- [ ] Edge count > 200 (imports + calls + renders)
- [ ] Scanner correctly identifies: functions, classes, interfaces, types, React components, Hono endpoints
- [ ] Edge types correctly assigned: imports, calls, extends, renders_component, routes_to
- [ ] Trust weights correctly calculated per rules table
- [ ] Re-scanning with unchanged files skips them (hash check)
- [ ] Python/Rust files scanned successfully (basic symbols + imports extracted)
- [ ] Scanner test passes with fixture files
