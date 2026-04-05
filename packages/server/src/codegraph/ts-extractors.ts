/**
 * Tree-sitter AST extractors — convert parsed trees into ScannedNode[] + ScannedEdge[].
 *
 * Each language has its own extractor function.
 * All return the same ScanResult shape as the regex scanner.
 */

import { createLogger } from "../logger.js";
import type { TSTree, TSNode } from "./tree-sitter-engine.js";
import type { ScannedNode, ScannedEdge, ScanResult } from "./scanner.js";
import type { EdgeType } from "./trust-calculator.js";

const log = createLogger("ts-extractors");

// ─── Helpers ────────────────────────────────────────────────────────────

function getBodyPreview(code: string, startLine: number, maxLines = 10): string {
  const lines = code.split("\n");
  return lines.slice(startLine - 1, startLine - 1 + maxLines).join("\n");
}

/** Find a direct child of the given type */
function childOfType(node: TSNode, type: string): TSNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

/** Check if a node (or its parent) has an export keyword */
function isExported(node: TSNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  // Direct: export function / export class / export const / export default
  if (parent.type === "export_statement") return true;
  // Named re-export: export { Foo } — node is export_specifier inside export_clause
  if (parent.type === "export_specifier") return true;
  return false;
}

/** Import entry: local name (used in code) + original name (used in edge target) */
interface ImportEntry {
  localName: string;
  originalName: string;
}

/** Get named imports from import clause, tracking aliases */
function extractNamedImports(importNode: TSNode): ImportEntry[] {
  const entries: ImportEntry[] = [];
  const clause = childOfType(importNode, "import_clause");
  if (!clause) return entries;

  // Named imports: { a, b, c as d }
  const namedImports = childOfType(clause, "named_imports");
  if (namedImports) {
    for (let i = 0; i < namedImports.childCount; i++) {
      const spec = namedImports.child(i);
      if (spec?.type === "import_specifier") {
        const ids = spec.descendantsOfType("identifier").filter(Boolean);
        if (ids.length >= 2) {
          // import { original as local }
          entries.push({ localName: ids[1]!.text, originalName: ids[0]!.text });
        } else if (ids.length === 1) {
          entries.push({ localName: ids[0]!.text, originalName: ids[0]!.text });
        }
      }
    }
  }

  // Default import: import Foo from '...'
  const defaultImport = childOfType(clause, "identifier");
  if (defaultImport) {
    entries.push({ localName: defaultImport.text, originalName: "default" });
  }

  // Namespace import: import * as ns from '...'
  const nsImport = childOfType(clause, "namespace_import");
  if (nsImport) {
    const nsName = childOfType(nsImport, "identifier");
    if (nsName) {
      entries.push({ localName: nsName.text, originalName: "*" });
    }
  }

  return entries;
}

/** Walk tree to collect all nodes of given types */
function collectNodes(root: TSNode, types: Set<string>): TSNode[] {
  const result: TSNode[] = [];
  const cursor = root.walk();

  let reached = cursor.gotoFirstChild();
  while (reached) {
    if (types.has(cursor.currentNode.type)) {
      result.push(cursor.currentNode);
    }
    // Recurse into children
    if (cursor.gotoFirstChild()) continue;
    // No children — try next sibling
    while (!cursor.gotoNextSibling()) {
      if (!cursor.gotoParent()) return result;
    }
  }

  return result;
}

// ─── TypeScript / JavaScript Extractor ──────────────────────────────────

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch"]);
const HTTP_OBJECTS = new Set(["app", "router", "server", "api"]);

export function extractTypeScript(tree: TSTree, code: string, filePath: string): ScanResult {
  const nodes: ScannedNode[] = [];
  const edges: ScannedEdge[] = [];
  // JSX pass only for .tsx files (parsed with tsx grammar that supports JSX node types)
  // .jsx files use javascript grammar which doesn't produce jsx_* nodes
  const isTsx = filePath.endsWith(".tsx");

  const root = tree.rootNode;

  // importMap: localName → { fromPath, originalName } — used for call graph resolution
  const importMap = new Map<string, { fromPath: string; originalName: string }>();

  // ── Pass 1: Imports ──────────────────────────────────────────────
  const importNodes = collectNodes(root, new Set(["import_statement"]));

  for (const imp of importNodes) {
    const sourceNode = imp.descendantsOfType("string_fragment")[0];
    if (!sourceNode) continue;

    const fromPath = sourceNode.text;
    const isTypeImport = imp.text.startsWith("import type");
    const edgeType: EdgeType = isTypeImport ? "uses_type" : "imports";

    const importEntries = extractNamedImports(imp);

    if (importEntries.length > 0) {
      for (const entry of importEntries) {
        edges.push({
          sourceSymbol: "__file__",
          targetFilePath: fromPath,
          targetSymbol: entry.originalName,
          edgeType,
          context: imp.text.trim().slice(0, 120),
        });

        // Build import map for call graph (skip type-only imports)
        // Key = localName (what code uses), value = originalName (what target exports)
        if (!isTypeImport) {
          importMap.set(entry.localName, { fromPath, originalName: entry.originalName });
        }
      }
    } else {
      // Side-effect import or unrecognized pattern
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: fromPath,
        targetSymbol: "*",
        edgeType,
        context: imp.text.trim().slice(0, 120),
      });
    }
  }

  // ── Pass 1B: Re-exports (export { ... } from '...') ──────────────
  const exportNodes = collectNodes(root, new Set(["export_statement"]));
  for (const exp of exportNodes) {
    // Re-export requires a source string: export { x } from './source'
    const sourceNode = exp.descendantsOfType("string_fragment")[0];
    if (!sourceNode) continue; // local export, not a re-export

    const fromPath = sourceNode.text;
    const exportClause = childOfType(exp, "export_clause");

    if (exportClause) {
      // Named re-export: export { foo, bar as baz } from './source'
      const specifiers = exportClause.descendantsOfType("export_specifier");
      for (const spec of specifiers) {
        if (!spec) continue;
        const ids = spec.descendantsOfType("identifier");
        const originalName = ids[0]?.text; // first = original name
        if (!originalName) continue;

        edges.push({
          sourceSymbol: "__file__",
          targetFilePath: fromPath,
          targetSymbol: originalName,
          edgeType: "imports",
          context: `re-export: ${exp.text.trim().slice(0, 100)}`,
        });
      }
    } else {
      // Wildcard re-export: export * from './source'
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: fromPath,
        targetSymbol: "*",
        edgeType: "imports",
        context: `re-export: ${exp.text.trim().slice(0, 100)}`,
      });
    }
  }

  // ── Pass 2: Declarations ─────────────────────────────────────────

  // Functions (function declarations)
  const funcDecls = collectNodes(root, new Set(["function_declaration"]));
  for (const func of funcDecls) {
    const nameNode = childOfType(func, "identifier");
    if (!nameNode) continue;

    const name = nameNode.text;
    const params = childOfType(func, "formal_parameters");
    const isHook = name.startsWith("use") && name.length > 3 && name[3]! === name[3]!.toUpperCase();
    const exported = isExported(func);

    nodes.push({
      symbolName: name,
      symbolType: isHook ? "hook" : "function",
      signature: params?.text ?? null,
      isExported: exported,
      lineStart: func.startPosition.row + 1,
      lineEnd: func.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, func.startPosition.row + 1),
    });
  }

  // Arrow functions (const name = (...) => ...)
  const lexDecls = collectNodes(root, new Set(["lexical_declaration"]));
  for (const lex of lexDecls) {
    const declarators = lex.descendantsOfType("variable_declarator");
    for (const decl of declarators) {
      if (!decl) continue;
      const nameNode = childOfType(decl, "identifier");
      const valueNode = decl.childForFieldName("value");

      if (!nameNode || !valueNode) continue;

      // Check if value is an arrow function (could be wrapped in call)
      let arrowNode: TSNode | null = null;
      if (valueNode.type === "arrow_function") {
        arrowNode = valueNode;
      } else if (valueNode.type === "call_expression") {
        // e.g., const Component = memo(() => ...)
        const args = valueNode.descendantsOfType("arrow_function");
        if (args.length > 0) arrowNode = args[0]!;
      }

      if (!arrowNode) {
        // Non-function const — only add if exported
        const exported = isExported(lex);
        if (exported && !nodes.some((n) => n.symbolName === nameNode.text)) {
          nodes.push({
            symbolName: nameNode.text,
            symbolType: "const",
            signature: null,
            isExported: true,
            lineStart: lex.startPosition.row + 1,
            lineEnd: lex.endPosition.row + 1,
            bodyPreview: getBodyPreview(code, lex.startPosition.row + 1, 3),
          });
        }
        continue;
      }

      const name = nameNode.text;
      const params = childOfType(arrowNode, "formal_parameters");
      const isComponent = /^[A-Z]/.test(name);
      const isHook = name.startsWith("use") && name.length > 3 && name[3]! === name[3]!.toUpperCase();
      const exported = isExported(lex);

      nodes.push({
        symbolName: name,
        symbolType: isComponent ? "component" : isHook ? "hook" : "function",
        signature: params?.text ?? null,
        isExported: exported,
        lineStart: lex.startPosition.row + 1,
        lineEnd: lex.endPosition.row + 1,
        bodyPreview: getBodyPreview(code, lex.startPosition.row + 1),
      });
    }
  }

  // Classes
  const classDecls = collectNodes(root, new Set(["class_declaration"]));
  for (const cls of classDecls) {
    const nameNode = childOfType(cls, "type_identifier");
    if (!nameNode) continue;

    const name = nameNode.text;
    const exported = isExported(cls);

    // Heritage
    const heritage = childOfType(cls, "class_heritage");
    let extendsName: string | null = null;
    const implementsNames: string[] = [];

    if (heritage) {
      const extendsClause = childOfType(heritage, "extends_clause");
      if (extendsClause) {
        const parent = extendsClause.childForFieldName("value");
        if (parent) extendsName = parent.text;
      }

      const implClause = childOfType(heritage, "implements_clause");
      if (implClause) {
        const ifaces = implClause.descendantsOfType("type_identifier");
        for (const iface of ifaces) {
          if (iface) implementsNames.push(iface.text);
        }
      }
    }

    nodes.push({
      symbolName: name,
      symbolType: "class",
      signature: extendsName ? `extends ${extendsName}` : null,
      isExported: exported,
      lineStart: cls.startPosition.row + 1,
      lineEnd: cls.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, cls.startPosition.row + 1),
    });

    if (extendsName) {
      edges.push({
        sourceSymbol: name,
        targetFilePath: "__resolve__",
        targetSymbol: extendsName,
        edgeType: "extends",
        context: `class ${name} extends ${extendsName}`,
      });
    }

    for (const iface of implementsNames) {
      edges.push({
        sourceSymbol: name,
        targetFilePath: "__resolve__",
        targetSymbol: iface,
        edgeType: "implements",
        context: `class ${name} implements ${iface}`,
      });
    }

    // Methods (qualified with class name to avoid collisions)
    const methods = cls.descendantsOfType("method_definition");
    for (const method of methods) {
      if (!method) continue;
      const methodName = childOfType(method, "property_identifier");
      if (!methodName || methodName.text === "constructor") continue;

      const methodParams = childOfType(method, "formal_parameters");
      nodes.push({
        symbolName: `${name}.${methodName.text}`,
        symbolType: "method",
        signature: methodParams?.text ?? null,
        isExported: false,
        lineStart: method.startPosition.row + 1,
        lineEnd: method.endPosition.row + 1,
        bodyPreview: getBodyPreview(code, method.startPosition.row + 1),
      });
    }
  }

  // Interfaces
  const ifaceDecls = collectNodes(root, new Set(["interface_declaration"]));
  for (const iface of ifaceDecls) {
    const nameNode = childOfType(iface, "type_identifier");
    if (!nameNode) continue;

    nodes.push({
      symbolName: nameNode.text,
      symbolType: "interface",
      signature: null,
      isExported: isExported(iface),
      lineStart: iface.startPosition.row + 1,
      lineEnd: iface.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, iface.startPosition.row + 1),
    });
  }

  // Type Aliases
  const typeDecls = collectNodes(root, new Set(["type_alias_declaration"]));
  for (const typeAlias of typeDecls) {
    const nameNode = childOfType(typeAlias, "type_identifier");
    if (!nameNode) continue;

    nodes.push({
      symbolName: nameNode.text,
      symbolType: "type",
      signature: null,
      isExported: isExported(typeAlias),
      lineStart: typeAlias.startPosition.row + 1,
      lineEnd: typeAlias.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, typeAlias.startPosition.row + 1, 5),
    });
  }

  // Enums
  const enumDecls = collectNodes(root, new Set(["enum_declaration"]));
  for (const enumDecl of enumDecls) {
    const nameNode = childOfType(enumDecl, "identifier");
    if (!nameNode) continue;

    nodes.push({
      symbolName: nameNode.text,
      symbolType: "enum",
      signature: null,
      isExported: isExported(enumDecl),
      lineStart: enumDecl.startPosition.row + 1,
      lineEnd: enumDecl.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, enumDecl.startPosition.row + 1),
    });
  }

  // ── Pass 3: Endpoints (app.get/post/...) ─────────────────────────
  const callExprs = collectNodes(root, new Set(["call_expression"]));
  for (const call of callExprs) {
    const funcNode = childOfType(call, "member_expression");
    if (!funcNode) continue;

    const obj = childOfType(funcNode, "identifier");
    const prop = childOfType(funcNode, "property_identifier");
    if (!obj || !prop) continue;

    if (!HTTP_OBJECTS.has(obj.text) || !HTTP_METHODS.has(prop.text)) continue;

    const args = childOfType(call, "arguments");
    if (!args) continue;

    const pathNode = args.descendantsOfType("string_fragment")[0];
    if (!pathNode) continue;

    const method = prop.text.toUpperCase();
    const path = pathNode.text;

    nodes.push({
      symbolName: `${method} ${path}`,
      symbolType: "endpoint",
      signature: `${method} ${path}`,
      isExported: false,
      lineStart: call.startPosition.row + 1,
      lineEnd: call.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, call.startPosition.row + 1),
    });
  }

  // ── Pass 4: JSX Component Usage (TSX only) ──────────────────────
  if (isTsx) {
    const jsxOpenings = collectNodes(
      root,
      new Set(["jsx_opening_element", "jsx_self_closing_element"]),
    );

    for (const jsx of jsxOpenings) {
      const nameNode = childOfType(jsx, "identifier");
      if (!nameNode) continue;

      const componentName = nameNode.text;
      // Only PascalCase (user components, not native elements)
      if (!/^[A-Z]/.test(componentName)) continue;

      // Find containing function/component
      let parent: TSNode | null = jsx.parent;
      let containingFunc: string | null = null;
      while (parent) {
        if (
          parent.type === "function_declaration" ||
          parent.type === "arrow_function"
        ) {
          const funcName =
            childOfType(parent, "identifier")?.text ??
            // Arrow: check the variable_declarator parent
            (parent.parent?.type === "variable_declarator"
              ? childOfType(parent.parent, "identifier")?.text
              : null);
          if (funcName) {
            containingFunc = funcName;
            break;
          }
        }
        parent = parent.parent;
      }

      if (containingFunc) {
        edges.push({
          sourceSymbol: containingFunc,
          targetFilePath: "__resolve__",
          targetSymbol: componentName,
          edgeType: "renders_component",
          context: `<${componentName} ...>`,
        });
      }
    }
  }

  // ── Pass 5: Call Graph (function calls to imported symbols) ──────
  if (importMap.size > 0) {
    const callEdges = extractCallEdges(root, importMap, nodes);
    edges.push(...callEdges);
  }

  return { nodes, edges };
}

// ─── Call Graph Extraction ──────────────────────────────────────────────

/** Built-in objects/functions to skip — not cross-file calls */
const BUILTIN_CALLEES = new Set([
  "console", "Math", "JSON", "Object", "Array", "String", "Number",
  "Boolean", "Promise", "Map", "Set", "Date", "Error", "RegExp",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "parseInt", "parseFloat", "fetch", "require", "Symbol",
  "Proxy", "Reflect", "WeakMap", "WeakSet", "Buffer", "process",
  "globalThis", "window", "document", "navigator",
  "Intl", "URL", "URLSearchParams", "AbortController",
  "TextEncoder", "TextDecoder", "Bun",
  // Node.js built-in modules (avoid false positive edges to local files)
  "fs", "path", "os", "crypto", "http", "https", "net", "child_process",
  "util", "events", "stream", "assert", "zlib", "dns", "tls",
  "structuredClone", "queueMicrotask", "performance", "EventEmitter",
]);

/**
 * Find the containing function/method name for a given AST node.
 * Walks up the tree to find the nearest function-like ancestor.
 */
function findContainingFunction(node: TSNode, extractedNodes: ScannedNode[]): string | null {
  let current: TSNode | null = node.parent;
  while (current) {
    if (current.type === "function_declaration") {
      const name = childOfType(current, "identifier");
      if (name) return name.text;
    }
    if (current.type === "arrow_function" || current.type === "function") {
      // Check if the parent is a variable_declarator
      const parent = current.parent;
      if (parent?.type === "variable_declarator") {
        const name = childOfType(parent, "identifier");
        if (name) return name.text;
      }
    }
    if (current.type === "method_definition") {
      const name = childOfType(current, "property_identifier");
      if (name) return name.text;
    }
    current = current.parent;
  }
  // Fallback: return first exported node name (file-level call)
  return null;
}

/**
 * Extract call edges by matching call_expression nodes against the import map.
 */
function extractCallEdges(
  root: TSNode,
  importMap: Map<string, { fromPath: string; originalName: string }>,
  extractedNodes: ScannedNode[],
): ScannedEdge[] {
  const edges: ScannedEdge[] = [];
  const seen = new Set<string>(); // dedup: sourceFunc:targetSymbol

  const callExprs = collectNodes(root, new Set(["call_expression"]));

  for (const call of callExprs) {
    const funcNode = call.childForFieldName("function") ?? call.child(0);
    if (!funcNode) continue;

    let calleeName: string | null = null;
    let importEntry: { fromPath: string; originalName: string } | undefined;

    if (funcNode.type === "identifier") {
      // Direct call: createLogger(), getDb()
      calleeName = funcNode.text;
      if (BUILTIN_CALLEES.has(calleeName)) continue;
      // Skip if a local function with the same name exists (local shadows import)
      if (extractedNodes.some((n) => n.symbolName === calleeName && (n.symbolType === "function" || n.symbolType === "method"))) continue;
      importEntry = importMap.get(calleeName);
    } else if (funcNode.type === "member_expression") {
      // Method call: obj.method()
      const obj = childOfType(funcNode, "identifier");
      const prop = childOfType(funcNode, "property_identifier");
      if (!obj || !prop) continue;

      if (BUILTIN_CALLEES.has(obj.text)) continue;

      // Check if obj is a namespace import
      importEntry = importMap.get(obj.text);
      if (importEntry) {
        calleeName = prop.text;
        // For namespace calls, target the specific method
        importEntry = { fromPath: importEntry.fromPath, originalName: prop.text };
      }
    }

    if (!calleeName || !importEntry) continue;

    const containingFunc = findContainingFunction(call, extractedNodes) ?? "__file__";
    const dedupKey = `${containingFunc}:${importEntry.fromPath}:${importEntry.originalName}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    edges.push({
      sourceSymbol: containingFunc,
      targetFilePath: importEntry.fromPath,
      targetSymbol: importEntry.originalName,
      edgeType: "calls",
      context: `${containingFunc}() calls ${calleeName}()`,
    });
  }

  return edges;
}

// ─── Python Extractor ───────────────────────────────────────────────────

export function extractPython(tree: TSTree, code: string, _filePath: string): ScanResult {
  const nodes: ScannedNode[] = [];
  const edges: ScannedEdge[] = [];
  const root = tree.rootNode;

  // Python import map for call graph
  const pyImportMap = new Map<string, { fromPath: string; originalName: string }>();

  // Imports: from X import Y
  const importFroms = collectNodes(root, new Set(["import_from_statement"]));
  for (const imp of importFroms) {
    const module = childOfType(imp, "dotted_name");
    if (!module) continue;

    const fromPath = module.text;
    const importedNames = imp.descendantsOfType("dotted_name").slice(1);

    for (const name of importedNames) {
      if (!name) continue;
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: fromPath,
        targetSymbol: name.text,
        edgeType: "imports",
        context: imp.text.trim().slice(0, 120),
      });
      pyImportMap.set(name.text, { fromPath, originalName: name.text });
    }
  }

  // Imports: import X
  const imports = collectNodes(root, new Set(["import_statement"]));
  for (const imp of imports) {
    const module = childOfType(imp, "dotted_name");
    if (!module) continue;

    edges.push({
      sourceSymbol: "__file__",
      targetFilePath: module.text,
      targetSymbol: "*",
      edgeType: "imports",
      context: imp.text.trim().slice(0, 120),
    });
  }

  // Functions
  const funcDefs = collectNodes(root, new Set(["function_definition"]));
  for (const func of funcDefs) {
    const nameNode = func.childForFieldName("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const params = func.childForFieldName("parameters");
    const isMethod = func.parent?.type === "block" && func.parent?.parent?.type === "class_definition";

    nodes.push({
      symbolName: name,
      symbolType: isMethod ? "method" : "function",
      signature: params?.text ?? null,
      isExported: !name.startsWith("_"),
      lineStart: func.startPosition.row + 1,
      lineEnd: func.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, func.startPosition.row + 1),
    });
  }

  // Classes
  const classDefs = collectNodes(root, new Set(["class_definition"]));
  for (const cls of classDefs) {
    const nameNode = cls.childForFieldName("name");
    if (!nameNode) continue;

    const name = nameNode.text;
    const superclasses = cls.childForFieldName("superclasses");
    let extendsName: string | null = null;

    if (superclasses) {
      const bases = superclasses.descendantsOfType("identifier").filter(Boolean);
      const firstBase = bases[0];
      if (firstBase && firstBase.text !== "object") {
        extendsName = firstBase.text;

        for (const base of bases) {
          if (base && base.text !== "object") {
            edges.push({
              sourceSymbol: name,
              targetFilePath: "__resolve__",
              targetSymbol: base.text,
              edgeType: "extends",
              context: `class ${name}(${superclasses.text})`,
            });
          }
        }
      }
    }

    nodes.push({
      symbolName: name,
      symbolType: "class",
      signature: extendsName ? `extends ${extendsName}` : null,
      isExported: !name.startsWith("_"),
      lineStart: cls.startPosition.row + 1,
      lineEnd: cls.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, cls.startPosition.row + 1),
    });
  }

  // Call graph for Python
  if (pyImportMap.size > 0) {
    const PYTHON_BUILTINS = new Set([
      "print", "len", "range", "enumerate", "zip", "map", "filter",
      "sorted", "reversed", "list", "dict", "set", "tuple", "str",
      "int", "float", "bool", "type", "isinstance", "issubclass",
      "super", "property", "staticmethod", "classmethod", "hasattr",
      "getattr", "setattr", "open", "input", "abs", "min", "max",
    ]);

    const pyCalls = collectNodes(root, new Set(["call"]));
    const pySeen = new Set<string>();

    for (const call of pyCalls) {
      const funcNode = call.childForFieldName("function") ?? call.child(0);
      if (!funcNode) continue;

      let calleeName: string | null = null;
      let entry: { fromPath: string; originalName: string } | undefined;

      if (funcNode.type === "identifier") {
        calleeName = funcNode.text;
        if (PYTHON_BUILTINS.has(calleeName)) continue;
        entry = pyImportMap.get(calleeName);
      } else if (funcNode.type === "attribute") {
        const obj = funcNode.childForFieldName("object");
        const attr = funcNode.childForFieldName("attribute");
        if (obj?.type === "identifier" && attr) {
          entry = pyImportMap.get(obj.text);
          if (entry) {
            calleeName = attr.text;
            entry = { fromPath: entry.fromPath, originalName: attr.text };
          }
        }
      }

      if (!calleeName || !entry) continue;

      // Find containing function for proper source attribution
      const sourceFunc = findContainingFunction(call, nodes) ?? "__file__";

      const dedupKey = `${sourceFunc}:${entry.fromPath}:${entry.originalName}`;
      if (pySeen.has(dedupKey)) continue;
      pySeen.add(dedupKey);

      edges.push({
        sourceSymbol: sourceFunc,
        targetFilePath: entry.fromPath,
        targetSymbol: entry.originalName,
        edgeType: "calls",
        context: `calls ${calleeName}()`,
      });
    }
  }

  return { nodes, edges };
}

// ─── Generic Extractor (Rust, Go, Java, C#, etc.) ──────────────────────

/**
 * Best-effort extractor for languages without dedicated support.
 * Uses common AST patterns shared across many languages.
 */
export function extractGeneric(tree: TSTree, code: string, _filePath: string, language: string): ScanResult {
  const nodes: ScannedNode[] = [];
  const edges: ScannedEdge[] = [];
  const root = tree.rootNode;

  // Language-specific node type mappings
  const funcTypes = new Set<string>();
  const classTypes = new Set<string>();
  const importTypes = new Set<string>();

  switch (language) {
    case "rust":
      funcTypes.add("function_item");
      classTypes.add("struct_item").add("enum_item").add("impl_item");
      importTypes.add("use_declaration");
      break;
    case "go":
      funcTypes.add("function_declaration").add("method_declaration");
      classTypes.add("type_declaration");
      importTypes.add("import_declaration");
      break;
    case "java":
    case "c_sharp":
    case "kotlin":
      funcTypes.add("method_declaration").add("constructor_declaration");
      classTypes.add("class_declaration").add("interface_declaration").add("enum_declaration");
      importTypes.add("import_declaration");
      break;
    case "c":
    case "cpp":
      funcTypes.add("function_definition").add("function_declaration");
      classTypes.add("struct_specifier").add("class_specifier");
      importTypes.add("preproc_include");
      break;
    case "ruby":
      funcTypes.add("method");
      classTypes.add("class").add("module");
      break;
    case "php":
      funcTypes.add("function_definition").add("method_declaration");
      classTypes.add("class_declaration").add("interface_declaration");
      importTypes.add("namespace_use_declaration");
      break;
    default:
      // Try common patterns
      funcTypes.add("function_declaration").add("function_definition").add("method_declaration");
      classTypes.add("class_declaration").add("struct_specifier");
      break;
  }

  // Extract functions
  const funcs = collectNodes(root, funcTypes);
  for (const func of funcs) {
    const nameNode = func.childForFieldName("name") ?? childOfType(func, "identifier");
    if (!nameNode) continue;

    const params = func.childForFieldName("parameters") ?? childOfType(func, "formal_parameters");

    nodes.push({
      symbolName: nameNode.text,
      symbolType: "function",
      signature: params?.text ?? null,
      isExported: true, // generic: assume exported
      lineStart: func.startPosition.row + 1,
      lineEnd: func.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, func.startPosition.row + 1),
    });
  }

  // Extract classes/structs
  const classes = collectNodes(root, classTypes);
  for (const cls of classes) {
    const nameNode = cls.childForFieldName("name") ?? childOfType(cls, "type_identifier") ?? childOfType(cls, "identifier");
    if (!nameNode) continue;

    nodes.push({
      symbolName: nameNode.text,
      symbolType: "class",
      signature: null,
      isExported: true,
      lineStart: cls.startPosition.row + 1,
      lineEnd: cls.endPosition.row + 1,
      bodyPreview: getBodyPreview(code, cls.startPosition.row + 1),
    });
  }

  // Extract imports
  const importDecls = collectNodes(root, importTypes);
  for (const imp of importDecls) {
    // Best effort: grab any string or path-like child
    const pathNode =
      imp.descendantsOfType("string_fragment")[0] ??
      imp.descendantsOfType("scoped_identifier")[0] ??
      imp.descendantsOfType("identifier")[0];

    if (pathNode) {
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: pathNode.text,
        targetSymbol: "*",
        edgeType: "imports",
        context: imp.text.trim().slice(0, 120),
      });
    }
  }

  return { nodes, edges };
}
