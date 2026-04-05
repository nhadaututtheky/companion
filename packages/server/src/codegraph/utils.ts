/**
 * CodeGraph utilities — file discovery, hashing, gitignore filter, language detection.
 */

import { readdir } from "fs/promises";
import { join, relative, extname, resolve } from "path";
import ignore from "ignore";
import { readFileSync, existsSync } from "fs";

// ─── Language Map ──────────────────────────────────────────────────────────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".rb": "ruby",
  ".vue": "vue",
  ".svelte": "svelte",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "c_sharp",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".lua": "lua",
  ".sh": "bash",
  ".sql": "sql",
};

/** Supported scannable extensions (worth extracting symbols from) */
const SCANNABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".rb",
  ".vue",
  ".svelte",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".swift",
  ".kt",
  ".scala",
]);

/** Directories to always skip */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".next",
  ".rune",
  "coverage",
  "__pycache__",
  "target",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "build",
  "out",
  ".output",
  ".nuxt",
  "vendor",
  ".venv",
  "venv",
  "env",
]);

// ─── File Discovery ──────────────────────────────────────────────────────

/**
 * Discover scannable source files in a project directory.
 * Respects .gitignore and skips common non-source directories.
 * Returns paths relative to projectDir.
 */
export async function discoverFiles(projectDir: string): Promise<string[]> {
  const ig = ignore();

  // Load .gitignore if it exists
  const gitignorePath = join(projectDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    ig.add(content);
  }

  const files: string[] = [];

  const resolvedRoot = resolve(projectDir);

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip symlinks to prevent path traversal
      if (entry.isSymbolicLink()) continue;

      const fullPath = join(dir, entry.name);

      // Boundary check: ensure path stays within project
      if (!resolve(fullPath).startsWith(resolvedRoot)) continue;

      const relPath = relative(projectDir, fullPath).replace(/\\/g, "/");

      // Skip ignored directories
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (ig.ignores(relPath + "/")) continue;
        await walk(fullPath);
        continue;
      }

      // Skip ignored files
      if (ig.ignores(relPath)) continue;

      // Only include scannable extensions
      const ext = extname(entry.name).toLowerCase();
      if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

      files.push(relPath);
    }
  }

  await walk(projectDir);
  return files.sort();
}

// ─── Hashing ─────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of file content.
 * Uses Bun's fast CryptoHasher.
 */
export function hashFile(absolutePath: string): string {
  const content = readFileSync(absolutePath);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex");
}

// ─── Language Detection ──────────────────────────────────────────────────

/**
 * Detect language from file extension.
 * Returns tree-sitter grammar name.
 */
export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? "unknown";
}

/**
 * Map our language name to tree-sitter WASM grammar name.
 * tree-sitter-wasms uses specific naming like "tree-sitter-typescript".
 */
export function treeSitterGrammarName(language: string): string | null {
  const map: Record<string, string> = {
    typescript: "typescript",
    tsx: "tsx",
    javascript: "javascript",
    python: "python",
    rust: "rust",
    go: "go",
    java: "java",
    ruby: "ruby",
    c: "c",
    cpp: "cpp",
    c_sharp: "c_sharp",
    php: "php",
    swift: "swift",
    kotlin: "kotlin",
    scala: "scala",
    lua: "lua",
    bash: "bash",
    html: "html",
    css: "css",
    json: "json",
    yaml: "yaml",
    toml: "toml",
    sql: "sql",
    svelte: "svelte",
    vue: "vue",
  };
  return map[language] ?? null;
}

// ─── Keywords ────────────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from text.
 * Splits on whitespace, camelCase, dots, slashes.
 */
export function extractKeywords(text: string): string[] {
  // Split camelCase and other boundaries
  const tokens = text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase -> camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // HTTPClient -> HTTP Client
    .replace(/[^a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2);

  // Remove noise words
  const noise = new Set([
    "the",
    "and",
    "for",
    "from",
    "with",
    "this",
    "that",
    "are",
    "was",
    "will",
    "can",
    "has",
    "not",
    "but",
  ]);
  return [...new Set(tokens.filter((t) => !noise.has(t)))];
}

// ─── File Stats ──────────────────────────────────────────────────────────

/** Max file size to scan (1MB) — skip larger files to avoid memory pressure */
export const MAX_SCAN_FILE_SIZE = 1_048_576;

/**
 * Get a preview of the body starting at a given line.
 */
export function getBodyPreview(code: string, startLine: number, maxLines = 10): string {
  const lines = code.split("\n");
  return lines.slice(startLine - 1, startLine - 1 + maxLines).join("\n");
}

/**
 * Count lines in a file content string.
 */
export function countLines(content: string): number {
  if (content.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") count++;
  }
  return count;
}
