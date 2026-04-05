/**
 * Tree-sitter WASM engine — lazy grammar loading + parser management.
 *
 * Uses `require()` for web-tree-sitter (CJS module in Bun).
 * Grammars from @repomix/tree-sitter-wasms loaded on first use per language.
 */

import { join } from "path";
import { existsSync } from "fs";
import { createLogger } from "../logger.js";
import { treeSitterGrammarName } from "./utils.js";

const log = createLogger("tree-sitter-engine");

// web-tree-sitter is CJS — use require() in Bun
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitter = require("web-tree-sitter") as typeof import("web-tree-sitter");
const TSParser = TreeSitter.Parser;
const TSLanguage = TreeSitter.Language;

export type TSTree = InstanceType<typeof TreeSitter.Tree>;
export type TSNode = InstanceType<typeof TreeSitter.Node>;
export type TSLanguageType = InstanceType<typeof TreeSitter.Language>;

// ─── State ──────────────────────────────────────────────────────────────

const grammars = new Map<string, TSLanguageType>();
const grammarExists = new Map<string, boolean>(); // memoized hasGrammar results

/** Directory containing .wasm grammar files (computed once) */
const grammarsDir: string = (() => {
  const candidates = [
    join(process.cwd(), "packages/server/node_modules/@repomix/tree-sitter-wasms/out"),
    join(process.cwd(), "node_modules/@repomix/tree-sitter-wasms/out"),
    join(import.meta.dir, "../../../node_modules/@repomix/tree-sitter-wasms/out"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
})();

// ─── Init ───────────────────────────────────────────────────────────────

/** Promise-singleton to prevent concurrent double-init of WASM runtime */
let initPromise: Promise<void> | null = null;

async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = TSParser.init()
      .then(() => log.info("Tree-sitter WASM runtime initialized"))
      .catch((err: unknown) => {
        initPromise = null; // allow retry on failure
        log.error("Failed to initialize Tree-sitter", { error: String(err) });
        throw err;
      });
  }
  return initPromise;
}

// ─── Grammar Loading ────────────────────────────────────────────────────

/**
 * Load a grammar by language name. Returns null if grammar not available.
 * Cached after first load.
 */
async function loadGrammar(language: string): Promise<TSLanguageType | null> {
  const grammarName = treeSitterGrammarName(language);
  if (!grammarName) return null;

  const cached = grammars.get(grammarName);
  if (cached) return cached;

  const wasmPath = join(grammarsDir, `tree-sitter-${grammarName}.wasm`);

  if (!existsSync(wasmPath)) {
    log.debug("Grammar WASM not found", { language, wasmPath });
    return null;
  }

  try {
    const lang = await TSLanguage.load(wasmPath);
    grammars.set(grammarName, lang);
    log.info("Grammar loaded", { language: grammarName });
    return lang;
  } catch (err) {
    log.warn("Failed to load grammar", { language: grammarName, error: String(err) });
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Parse source code with Tree-sitter. Returns AST tree or null if grammar unavailable.
 */
export async function parseCode(code: string, language: string): Promise<TSTree | null> {
  await ensureInit();

  const grammar = await loadGrammar(language);
  if (!grammar) return null;

  const parser = new TSParser();
  parser.setLanguage(grammar);

  const tree = parser.parse(code);
  parser.delete(); // free WASM memory

  return tree;
}

/**
 * Check if Tree-sitter has a grammar for the given language.
 */
export function hasGrammar(language: string): boolean {
  const grammarName = treeSitterGrammarName(language);
  if (!grammarName) return false;

  const cached = grammarExists.get(grammarName);
  if (cached !== undefined) return cached;

  const exists = existsSync(join(grammarsDir, `tree-sitter-${grammarName}.wasm`));
  grammarExists.set(grammarName, exists);
  return exists;
}

/**
 * Get list of languages with available WASM grammars.
 */
export function getAvailableGrammars(): string[] {
  return [
    "typescript", "tsx", "javascript", "python", "rust", "go", "java",
    "c", "cpp", "c_sharp", "ruby", "php", "swift", "css", "vue",
  ].filter(hasGrammar);
}

/**
 * Load a Tree-sitter query for a language. Returns null if grammar unavailable.
 */
export async function createQuery(language: string, queryString: string) {
  await ensureInit();
  const grammar = await loadGrammar(language);
  if (!grammar) return null;

  try {
    return grammar.query(queryString);
  } catch (err) {
    log.warn("Failed to create query", { language, error: String(err) });
    return null;
  }
}
