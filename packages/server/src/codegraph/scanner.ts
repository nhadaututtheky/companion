/**
 * CodeGraph scanner — extracts symbols (nodes) and relationships (edges) from source files.
 *
 * Uses regex-based extraction for reliability across all environments.
 * Handles TypeScript/JavaScript deeply, other languages with basic patterns.
 */

import { createLogger } from "../logger.js";
import type { EdgeType } from "./trust-calculator.js";

const log = createLogger("codegraph-scanner");

// ─── Types ───────────────────────────────────────────────────────────────

export type SymbolType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "const"
  | "component"
  | "endpoint"
  | "hook"
  | "method"
  | "enum";

export interface ScannedNode {
  symbolName: string;
  symbolType: SymbolType;
  signature: string | null;
  isExported: boolean;
  lineStart: number;
  lineEnd: number;
  bodyPreview: string | null;
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

// ─── Line Helpers ────────────────────────────────────────────────────────

function lineAt(code: string, charIndex: number): number {
  let line = 1;
  for (let i = 0; i < charIndex && i < code.length; i++) {
    if (code[i] === "\n") line++;
  }
  return line;
}

function getBodyPreview(code: string, startLine: number, maxLines = 10): string {
  const lines = code.split("\n");
  return lines.slice(startLine - 1, startLine - 1 + maxLines).join("\n");
}

function estimateEndLine(code: string, startLine: number): number {
  const lines = code.split("\n");
  let depth = 0;
  let started = false;

  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === "{") { depth++; started = true; }
      if (ch === "}") { depth--; }
    }
    if (started && depth <= 0) return i + 1;
  }

  return Math.min(startLine + 20, lines.length);
}

// ─── TypeScript/JavaScript Scanner ───────────────────────────────────────

function scanTypeScript(code: string, filePath: string): ScanResult {
  const nodes: ScannedNode[] = [];
  const edges: ScannedEdge[] = [];

  // ── Imports ──
  const importRegex = /^import\s+(?:type\s+)?(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(code)) !== null) {
    const namedImports = match[1];
    const namespaceImport = match[2];
    const defaultImport = match[3];
    const fromPath = match[4]!;
    const isTypeImport = match[0].includes("import type");
    const edgeType: EdgeType = isTypeImport ? "uses_type" : "imports";

    if (namedImports) {
      const symbols = namedImports
        .replace(/[{}]/g, "")
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0]!.trim())
        .filter(Boolean);

      for (const sym of symbols) {
        edges.push({
          sourceSymbol: "__file__",
          targetFilePath: fromPath,
          targetSymbol: sym,
          edgeType,
          context: match[0].trim(),
        });
      }
    }

    if (defaultImport) {
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: fromPath,
        targetSymbol: "default",
        edgeType,
        context: match[0].trim(),
      });
    }

    if (namespaceImport) {
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: fromPath,
        targetSymbol: "*",
        edgeType,
        context: match[0].trim(),
      });
    }
  }

  // ── Exported Functions ──
  const funcRegex = /^(export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))/gm;
  while ((match = funcRegex.exec(code)) !== null) {
    const isExported = !!match[1];
    const name = match[2]!;
    const params = match[3] ?? "";
    const line = lineAt(code, match.index);
    const isHook = name.startsWith("use") && name[3] === name[3]?.toUpperCase();

    nodes.push({
      symbolName: name,
      symbolType: isHook ? "hook" : "function",
      signature: params,
      isExported,
      lineStart: line,
      lineEnd: estimateEndLine(code, line),
      bodyPreview: getBodyPreview(code, line),
    });
  }

  // ── Arrow Functions (const name = (...) => ...) ──
  const arrowRegex = /^(export\s+(?:default\s+)?)?const\s+(\w+)\s*(?::\s*\w+(?:<[^>]+>)?\s*)?=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*[^\n=>]+)?\s*=>/gm;
  while ((match = arrowRegex.exec(code)) !== null) {
    const isExported = !!match[1];
    const name = match[2]!;
    const params = `(${match[3] ?? ""})`;
    const line = lineAt(code, match.index);

    const isComponent = /^[A-Z]/.test(name);
    const isHook = name.startsWith("use") && name[3] === name[3]?.toUpperCase();

    nodes.push({
      symbolName: name,
      symbolType: isComponent ? "component" : isHook ? "hook" : "function",
      signature: params,
      isExported,
      lineStart: line,
      lineEnd: estimateEndLine(code, line),
      bodyPreview: getBodyPreview(code, line),
    });
  }

  // ── Classes ──
  const classRegex = /^(export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+(\w+(?:\s*,\s*\w+)*))?/gm;
  while ((match = classRegex.exec(code)) !== null) {
    const isExported = !!match[1];
    const name = match[2]!;
    const extendsName = match[3];
    const implementsNames = match[4];
    const line = lineAt(code, match.index);

    nodes.push({
      symbolName: name,
      symbolType: "class",
      signature: extendsName ? `extends ${extendsName}` : null,
      isExported,
      lineStart: line,
      lineEnd: estimateEndLine(code, line),
      bodyPreview: getBodyPreview(code, line),
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

    if (implementsNames) {
      for (const iface of implementsNames.split(",").map((s) => s.trim())) {
        edges.push({
          sourceSymbol: name,
          targetFilePath: "__resolve__",
          targetSymbol: iface,
          edgeType: "implements",
          context: `class ${name} implements ${iface}`,
        });
      }
    }
  }

  // ── Interfaces ──
  const ifaceRegex = /^(export\s+)?interface\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+(\w+(?:\s*,\s*\w+)*))?/gm;
  while ((match = ifaceRegex.exec(code)) !== null) {
    const isExported = !!match[1];
    const name = match[2]!;
    const line = lineAt(code, match.index);

    nodes.push({
      symbolName: name,
      symbolType: "interface",
      signature: null,
      isExported,
      lineStart: line,
      lineEnd: estimateEndLine(code, line),
      bodyPreview: getBodyPreview(code, line),
    });
  }

  // ── Type Aliases ──
  const typeRegex = /^(export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=/gm;
  while ((match = typeRegex.exec(code)) !== null) {
    const isExported = !!match[1];
    const name = match[2]!;
    const line = lineAt(code, match.index);

    nodes.push({
      symbolName: name,
      symbolType: "type",
      signature: null,
      isExported,
      lineStart: line,
      lineEnd: line + 5,
      bodyPreview: getBodyPreview(code, line, 5),
    });
  }

  // ── Enums ──
  const enumRegex = /^(export\s+)?(?:const\s+)?enum\s+(\w+)/gm;
  while ((match = enumRegex.exec(code)) !== null) {
    const isExported = !!match[1];
    const name = match[2]!;
    const line = lineAt(code, match.index);

    nodes.push({
      symbolName: name,
      symbolType: "enum",
      signature: null,
      isExported,
      lineStart: line,
      lineEnd: estimateEndLine(code, line),
      bodyPreview: getBodyPreview(code, line),
    });
  }

  // ── Exported Constants (non-function) ──
  const constRegex = /^export\s+const\s+(\w+)\s*(?::\s*([^=]+?)\s*)?=/gm;
  while ((match = constRegex.exec(code)) !== null) {
    const name = match[1]!;
    const typeAnnotation = match[2]?.trim();
    const line = lineAt(code, match.index);

    // Skip if already captured as arrow function
    if (nodes.some((n) => n.symbolName === name)) continue;

    nodes.push({
      symbolName: name,
      symbolType: "const",
      signature: typeAnnotation ?? null,
      isExported: true,
      lineStart: line,
      lineEnd: line + 3,
      bodyPreview: getBodyPreview(code, line, 3),
    });
  }

  // ── Hono Endpoints (app.get/post/put/delete) ──
  const endpointRegex = /(?:app|router|server|api)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gm;
  while ((match = endpointRegex.exec(code)) !== null) {
    const method = match[1]!.toUpperCase();
    const path = match[2]!;
    const line = lineAt(code, match.index);

    nodes.push({
      symbolName: `${method} ${path}`,
      symbolType: "endpoint",
      signature: `${method} ${path}`,
      isExported: false,
      lineStart: line,
      lineEnd: estimateEndLine(code, line),
      bodyPreview: getBodyPreview(code, line),
    });
  }

  // ── JSX Component Usage (renders_component edges) ──
  const jsxRegex = /<([A-Z]\w+)\s/g;
  while ((match = jsxRegex.exec(code)) !== null) {
    const componentName = match[1]!;
    // Find which function/component contains this JSX
    const line = lineAt(code, match.index);
    const parentNode = nodes.find(
      (n) => (n.symbolType === "component" || n.symbolType === "function") && n.lineStart <= line && n.lineEnd >= line,
    );

    if (parentNode) {
      edges.push({
        sourceSymbol: parentNode.symbolName,
        targetFilePath: "__resolve__",
        targetSymbol: componentName,
        edgeType: "renders_component",
        context: `<${componentName} ...>`,
      });
    }
  }

  return { nodes, edges };
}

// ─── Python Scanner ──────────────────────────────────────────────────────

function scanPython(code: string, _filePath: string): ScanResult {
  const nodes: ScannedNode[] = [];
  const edges: ScannedEdge[] = [];
  let match: RegExpExecArray | null;

  // Imports
  const importFromRegex = /^from\s+(\S+)\s+import\s+(.+)/gm;
  while ((match = importFromRegex.exec(code)) !== null) {
    const fromPath = match[1]!;
    const symbols = match[2]!.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]!.trim());
    for (const sym of symbols) {
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: fromPath,
        targetSymbol: sym,
        edgeType: "imports",
        context: match[0].trim(),
      });
    }
  }

  const importRegex = /^import\s+(\S+)/gm;
  while ((match = importRegex.exec(code)) !== null) {
    edges.push({
      sourceSymbol: "__file__",
      targetFilePath: match[1]!,
      targetSymbol: "*",
      edgeType: "imports",
      context: match[0].trim(),
    });
  }

  // Functions
  const funcRegex = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm;
  while ((match = funcRegex.exec(code)) !== null) {
    const indent = match[1]!;
    const name = match[2]!;
    const params = `(${match[3] ?? ""})`;
    const line = lineAt(code, match.index);

    nodes.push({
      symbolName: name,
      symbolType: indent.length > 0 ? "method" : "function",
      signature: params,
      isExported: !name.startsWith("_"),
      lineStart: line,
      lineEnd: line + 10,
      bodyPreview: getBodyPreview(code, line),
    });
  }

  // Classes
  const classRegex = /^class\s+(\w+)(?:\(([^)]*)\))?/gm;
  while ((match = classRegex.exec(code)) !== null) {
    const name = match[1]!;
    const bases = match[2];
    const line = lineAt(code, match.index);

    nodes.push({
      symbolName: name,
      symbolType: "class",
      signature: bases ? `extends ${bases}` : null,
      isExported: !name.startsWith("_"),
      lineStart: line,
      lineEnd: line + 20,
      bodyPreview: getBodyPreview(code, line),
    });

    if (bases) {
      for (const base of bases.split(",").map((s) => s.trim())) {
        if (base && base !== "object") {
          edges.push({
            sourceSymbol: name,
            targetFilePath: "__resolve__",
            targetSymbol: base,
            edgeType: "extends",
            context: `class ${name}(${bases})`,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

// ─── Generic Fallback Scanner ────────────────────────────────────────────

function scanGeneric(code: string, _filePath: string): ScanResult {
  const nodes: ScannedNode[] = [];
  const edges: ScannedEdge[] = [];
  let match: RegExpExecArray | null;

  // Generic function patterns (Go, Rust, Java, etc.)
  const funcPatterns = [
    /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[(<]/gm,          // Rust
    /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/gm,          // Go
    /^(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?\w+\s+(\w+)\s*\(/gm,  // Java/C#
  ];

  for (const pattern of funcPatterns) {
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1]!;
      const line = lineAt(code, match.index);
      nodes.push({
        symbolName: name,
        symbolType: "function",
        signature: null,
        isExported: true,
        lineStart: line,
        lineEnd: line + 10,
        bodyPreview: getBodyPreview(code, line),
      });
    }
  }

  // Generic class/struct patterns
  const classPatterns = [
    /^(?:pub\s+)?struct\s+(\w+)/gm,          // Rust
    /^type\s+(\w+)\s+struct/gm,               // Go
    /^(?:public\s+)?class\s+(\w+)/gm,         // Java/C#
  ];

  for (const pattern of classPatterns) {
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1]!;
      const line = lineAt(code, match.index);
      nodes.push({
        symbolName: name,
        symbolType: "class",
        signature: null,
        isExported: true,
        lineStart: line,
        lineEnd: line + 10,
        bodyPreview: getBodyPreview(code, line),
      });
    }
  }

  // Generic import patterns
  const importPatterns = [
    /^use\s+(\S+)::/gm,                       // Rust
    /^import\s+"([^"]+)"/gm,                   // Go
    /^import\s+(\S+)/gm,                       // Java
  ];

  for (const pattern of importPatterns) {
    while ((match = pattern.exec(code)) !== null) {
      edges.push({
        sourceSymbol: "__file__",
        targetFilePath: match[1]!,
        targetSymbol: "*",
        edgeType: "imports",
        context: match[0].trim(),
      });
    }
  }

  return { nodes, edges };
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Scan a source file and extract symbols + relationships.
 */
export function scanFile(code: string, filePath: string, language: string): ScanResult {
  try {
    switch (language) {
      case "typescript":
      case "tsx":
      case "javascript":
        return scanTypeScript(code, filePath);
      case "python":
        return scanPython(code, filePath);
      case "rust":
      case "go":
      case "java":
      case "c_sharp":
      case "kotlin":
      case "scala":
      case "cpp":
      case "c":
        return scanGeneric(code, filePath);
      default:
        // Try TypeScript patterns as default (works for many C-like languages)
        return scanTypeScript(code, filePath);
    }
  } catch (err) {
    log.warn("Scanner error, returning empty result", { filePath, language, error: String(err) });
    return { nodes: [], edges: [] };
  }
}
