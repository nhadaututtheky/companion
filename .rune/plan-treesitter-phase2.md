# Phase 2: Call Graph Extraction

## Goal
Extract **function call edges** from Tree-sitter AST — the most impactful upgrade. Currently CodeGraph only tracks imports/extends/implements/renders. Adding `calls` edges enables true impact analysis: "function A calls function B in another file" instead of just "file A imports file B".

## Pre-requisites
- Phase 1 complete (Tree-sitter engine + extractors working)

## Context: Current Edge Types
From `trust-calculator.ts`:
```
imports: 0.5, calls: 0.9, extends: 0.95, implements: 0.95,
uses_type: 0.4, renders_component: 0.8, routes_to: 0.7,
queries_table: 0.6, tests: 0.7, configures: 0.3
```
The `calls` edge type EXISTS in the schema (weight 0.9) but is NEVER extracted by regex scanner. Tree-sitter unlocks this.

## Tasks
- [ ] Add call extraction to `ts-extractors.ts` — TypeScript/JavaScript:
  - Tree-sitter query: `(call_expression function: (identifier) @callee)`
  - Also: `(call_expression function: (member_expression object: (identifier) @obj property: (property_identifier) @method))`
  - Map callee name to imported symbols: if `callee` matches an import name → create `calls` edge
  - Map `obj.method()` to imported objects: if `obj` matches a namespace import → create `calls` edge
  - Output as `ScannedEdge` with `edgeType: "calls"`, `sourceSymbol` = containing function, `targetSymbol` = callee
  - Filter noise: skip built-in calls (console.log, Math.*, Array.*, Object.*, Promise.*, setTimeout, etc.)
  - Skip intra-function calls (local helpers defined in same scope)
- [ ] Add call extraction to Python extractor:
  - Query: `(call function: (identifier) @callee)`
  - Query: `(call function: (attribute object: (identifier) @obj attribute: (identifier) @method))`
  - Map to imported symbols
- [ ] Add call extraction to generic extractors (Rust, Go, Java):
  - Rust: `(call_expression function: (identifier) @callee)`
  - Go: `(call_expression function: (identifier) @callee)` + `(call_expression function: (selector_expression) @callee)`
  - Java: `(method_invocation name: (identifier) @method object: (identifier) @obj)`
- [ ] Update `scanner.ts` — include call edges in `ScanResult`
  - No interface change needed — `ScannedEdge` already has `edgeType: EdgeType` which includes "calls"
  - Just ensure extractors emit them
- [ ] Update `diff-updater.ts` edge resolution:
  - `calls` edges need same resolution as other edges: match `targetSymbol` to DB nodes by name
  - The existing resolution loop (line 264-285) already handles this — verify it works for `calls` type
- [ ] Update trust calculation context:
  - In `diff-updater.ts` line 281: `calculateTrustWeight(edge.edgeType as EdgeType)`
  - For `calls` edges, also detect if the file already has an `imports` edge to same target → set `context.hasCall = true`
  - This upgrades import weight from 0.5 → 0.9 (import + call = tight coupling)
- [ ] Verify query-engine BFS now follows `calls` edges:
  - `getImpactRadius()` already follows ALL outgoing edges regardless of type — should work automatically
  - `getReverseDependencies()` — same, follows ALL incoming edges
  - Test: impact radius should now include files that are CALLED, not just imported
- [ ] TypeScript compiles clean
- [ ] Manual test: scan a project, verify `calls` edges appear in DB, verify impact radius is richer

## Key Technical Details

### Call Extraction Pattern (TypeScript)
```typescript
function extractCalls(tree: Parser.Tree, code: string, importMap: Map<string, string>): ScannedEdge[] {
  const edges: ScannedEdge[] = [];
  
  // importMap: Map<localName, fromPath> built from import extraction
  // e.g., { "createLogger": "../logger.js", "getDb": "../db/client.js" }
  
  const query = language.query(`
    (call_expression
      function: (identifier) @callee)
    (call_expression
      function: (member_expression
        object: (identifier) @obj
        property: (property_identifier) @method))
  `);
  
  const matches = query.matches(tree.rootNode);
  
  for (const match of matches) {
    const callee = match.captures.find(c => c.name === "callee")?.node.text;
    const obj = match.captures.find(c => c.name === "obj")?.node.text;
    
    if (callee && importMap.has(callee)) {
      // Direct call to imported function
      const containingFunc = findContainingFunction(match.captures[0].node);
      edges.push({
        sourceSymbol: containingFunc ?? "__file__",
        targetFilePath: importMap.get(callee)!,
        targetSymbol: callee,
        edgeType: "calls",
        context: `${containingFunc ?? "module"}() calls ${callee}()`,
      });
    }
    
    if (obj && importMap.has(obj)) {
      const method = match.captures.find(c => c.name === "method")?.node.text;
      // Namespace call: importedModule.method()
      edges.push({
        sourceSymbol: findContainingFunction(match.captures[0].node) ?? "__file__",
        targetFilePath: importMap.get(obj)!,
        targetSymbol: method ?? "*",
        edgeType: "calls",
        context: `calls ${obj}.${method}()`,
      });
    }
  }
  
  return edges;
}
```

### Built-in Call Filter
```typescript
const BUILTIN_OBJECTS = new Set([
  "console", "Math", "JSON", "Object", "Array", "String", "Number",
  "Boolean", "Promise", "Map", "Set", "Date", "Error", "RegExp",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "parseInt", "parseFloat", "fetch", "require",
]);
```

### Import Map Construction
During import extraction in Phase 1, build a `Map<string, string>` that maps local imported names to their source paths. This is CRITICAL for call resolution — without it, we can't know if `createLogger()` is an imported call or a local function.

```typescript
// From import extraction:
// import { createLogger } from "../logger.js"
// → importMap.set("createLogger", "../logger.js")
//
// import * as db from "../db/client.js"  
// → importMap.set("db", "../db/client.js")
//
// import getDb from "../db/client.js"
// → importMap.set("getDb", "../db/client.js")
```

## Expected Impact
- **Before**: Impact radius only follows import edges (trust 0.5) — shallow, misses actual usage
- **After**: Impact radius follows call edges (trust 0.9) — deep, traces real execution flow
- **Context injection**: `buildMessageContext()` returns more relevant nodes because BFS reaches actually-called code
- **Token savings**: Fewer false positives → less noise in injected context

## Acceptance Criteria
- [ ] `calls` edges appear in `code_edges` table after scanning
- [ ] `calls` edges link to correct target nodes (not dangling)
- [ ] Built-in calls filtered out (no `console.log` edges)
- [ ] Import + call to same target upgrades trust (0.5 → 0.9)
- [ ] `getImpactRadius()` returns deeper results with call edges
- [ ] TypeScript compiles clean
- [ ] No regression in existing edge types (imports, extends, etc.)

## Files Touched
- `packages/server/src/codegraph/ts-extractors.ts` — modify (add call extraction)
- `packages/server/src/codegraph/diff-updater.ts` — modify (trust context for calls)
- `packages/server/src/codegraph/trust-calculator.ts` — verify (no change needed, `calls: 0.9` already defined)

## Dependencies
- Requires Phase 1 complete (Tree-sitter engine + importMap from extractors)
