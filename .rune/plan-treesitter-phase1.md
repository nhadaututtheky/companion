# Phase 1: Drop-in Scanner Replace (Tree-sitter WASM)

## Goal
Replace regex-based `scanFile()` with Tree-sitter WASM parser. Same interface, same output types (`ScannedNode[]`, `ScannedEdge[]`), but accurate AST-based extraction. Zero changes to downstream code (graph-store, diff-updater, query-engine, agent-context-provider).

## Pre-requisites
- Install: `bun add web-tree-sitter@^0.25.10` (pin — 0.26.x has ABI break)
- Download WASM grammars for priority languages (see task list)
- Verify Bun can load `.wasm` files via `web-tree-sitter` init

## Tasks
- [ ] Install `web-tree-sitter@^0.25.10` in `packages/server`
- [ ] Download WASM grammar files for: typescript, tsx, javascript, python, rust, go, java, c, cpp, c_sharp, ruby, kotlin, php
  - Source: `tree-sitter-wasms` npm package OR build from `tree-sitter build --wasm`
  - Store in: `packages/server/src/codegraph/grammars/` (gitignored, downloaded on first scan)
  - Alternative: use `tree-sitter-language-pack` if it bundles WASM
- [ ] Create `packages/server/src/codegraph/tree-sitter-engine.ts` — the new parser engine
  - Singleton: `initTreeSitter()` — call `Parser.init()` once, cache loaded grammars
  - Lazy grammar loading: `loadGrammar(language: string): Promise<Language>`
  - Grammar cache: `Map<string, Language>` — load once, reuse
  - Main function: `parseWithTreeSitter(code: string, language: string): Tree | null`
- [ ] Create `packages/server/src/codegraph/ts-extractors.ts` — Tree-sitter query-based symbol extractors
  - **TypeScript/JavaScript extractor** (highest priority, most files):
    - Nodes: function_declaration, arrow_function (in variable_declarator), class_declaration, interface_declaration, type_alias_declaration, enum_declaration, method_definition, lexical_declaration (exported const)
    - Edges: import_statement → parse from/symbols, jsx_element/jsx_self_closing_element → renders_component, class heritage → extends/implements
    - Use S-expression queries: `(function_declaration name: (identifier) @name)` etc.
    - Extract exact `startPosition.row` / `endPosition.row` for lineStart/lineEnd
    - Extract parameter list from function params node for signature
    - Detect hooks: `use*` + PascalCase 4th char
    - Detect components: PascalCase + JSX return
    - Detect endpoints: `app.get("...")` call_expression pattern
  - **Python extractor**:
    - function_definition, class_definition, import_statement, import_from_statement
    - Indent-based method detection: function_definition inside class_definition
  - **Generic extractor** (Rust, Go, Java, C#, etc.):
    - function_item (Rust), function_declaration (Go), method_declaration (Java)
    - struct_item, type_spec (Go struct), class_declaration
    - use_declaration (Rust), import_declaration (Go/Java)
- [ ] Modify `packages/server/src/codegraph/scanner.ts`:
  - Keep existing `scanFile()` as public API — same signature, same return type
  - Add async variant: `scanFileAsync(code, filePath, language): Promise<ScanResult>`
  - Inside: try Tree-sitter first → if grammar not available, fall back to regex
  - Keep ALL regex functions intact as fallback (don't delete them)
  - Add `isTreeSitterReady(): boolean` check
- [ ] Update `packages/server/src/codegraph/utils.ts`:
  - `treeSitterGrammarName()` already exists — verify mapping is correct for all grammars
  - Add `getGrammarPath(language: string): string` helper
- [ ] Update `packages/server/src/codegraph/diff-updater.ts`:
  - Change `scanFile()` calls to `await scanFileAsync()` (line 202)
  - Change edge re-scan loop to use `await scanFileAsync()` (line 261)
  - `incrementalRescan` is already async — just await the scanner calls
- [ ] TypeScript compiles clean (`bun run build` or `tsc --noEmit` in packages/server)
- [ ] Manual test: scan Companion's own codebase, compare node counts regex vs tree-sitter

## Key Technical Details

### Tree-sitter Init Pattern
```typescript
import Parser from "web-tree-sitter";

let initialized = false;
const grammars = new Map<string, Parser.Language>();

async function initTreeSitter(): Promise<void> {
  if (initialized) return;
  await Parser.init(); // loads WASM runtime
  initialized = true;
}

async function getParser(language: string): Promise<Parser | null> {
  await initTreeSitter();
  const grammarName = treeSitterGrammarName(language);
  if (!grammarName) return null;
  
  if (!grammars.has(grammarName)) {
    const wasmPath = getGrammarPath(grammarName);
    if (!existsSync(wasmPath)) return null;
    const lang = await Parser.Language.load(wasmPath);
    grammars.set(grammarName, lang);
  }
  
  const parser = new Parser();
  parser.setLanguage(grammars.get(grammarName)!);
  return parser;
}
```

### S-expression Query Examples (TypeScript)
```
;; Functions
(function_declaration
  name: (identifier) @name
  parameters: (formal_parameters) @params) @func

;; Arrow functions  
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: (arrow_function
      parameters: (formal_parameters) @params))) @arrow

;; Classes
(class_declaration
  name: (type_identifier) @name
  (class_heritage)? @heritage) @class

;; Imports
(import_statement
  source: (string) @source) @import

;; JSX usage
(jsx_opening_element
  name: (identifier) @component)
```

### ScannedNode from Tree-sitter
```typescript
// Current regex output (keep same shape):
{
  symbolName: node.text,           // from @name capture
  symbolType: "function",          // from node parent type
  signature: paramsNode?.text,     // from @params capture
  isExported: hasExportKeyword,    // check parent for export_statement
  lineStart: node.startPosition.row + 1,  // tree-sitter is 0-indexed
  lineEnd: node.endPosition.row + 1,      // EXACT (no more estimation!)
  bodyPreview: getBodyPreview(code, lineStart, 10),
}
```

### Fallback Strategy
```typescript
export async function scanFileAsync(code: string, filePath: string, language: string): Promise<ScanResult> {
  try {
    const parser = await getParser(language);
    if (parser) {
      const tree = parser.parse(code);
      return extractFromTree(tree, code, filePath, language);
    }
  } catch (err) {
    log.warn("Tree-sitter parse failed, falling back to regex", { filePath, error: String(err) });
  }
  // Fallback to existing regex
  return scanFile(code, filePath, language);
}
```

## Grammar WASM Files

Priority (Companion's typical user projects):
1. **typescript** + **tsx** — most important, Companion itself is TS
2. **javascript** — many projects
3. **python** — second most popular language
4. **rust**, **go** — popular systems langs
5. **java**, **c_sharp** — enterprise
6. **c**, **cpp** — systems
7. **ruby**, **kotlin**, **php** — bonus

Total WASM size estimate: ~15-25 MB on disk, ~3-8 MB in memory (loaded lazily).

## Acceptance Criteria
- [ ] `scanFileAsync()` returns same `ScanResult` shape as regex `scanFile()`
- [ ] Line numbers are EXACT (not estimated) for Tree-sitter parsed files
- [ ] Falls back to regex gracefully when grammar not available
- [ ] No changes to graph-store, query-engine, agent-context-provider, trust-calculator
- [ ] `diff-updater.ts` uses async scanner — `incrementalRescan` still works
- [ ] TypeScript compiles clean
- [ ] Node count from Tree-sitter >= regex count (should find MORE symbols, not fewer)

## Files Touched
- `packages/server/package.json` — add `web-tree-sitter` dep
- `packages/server/src/codegraph/tree-sitter-engine.ts` — new (grammar init + parser pool)
- `packages/server/src/codegraph/ts-extractors.ts` — new (language-specific AST extractors)
- `packages/server/src/codegraph/scanner.ts` — modify (add `scanFileAsync`, keep regex intact)
- `packages/server/src/codegraph/utils.ts` — modify (add `getGrammarPath`)
- `packages/server/src/codegraph/diff-updater.ts` — modify (use `scanFileAsync`)
- `packages/server/src/codegraph/grammars/` — new dir (WASM files, gitignored)
- `.gitignore` — add `packages/server/src/codegraph/grammars/*.wasm`

## Dependencies
- None — Phase 1 is self-contained
- Phase 2 builds on this (adds call graph extraction using same Tree-sitter infrastructure)
