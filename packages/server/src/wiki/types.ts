/**
 * Wiki Knowledge Base — Type definitions.
 *
 * Karpathy-style LLM Wiki: local filesystem, LLM-compiled articles,
 * context-loading retrieval (not RAG).
 */

// ─── Domain ─────────────────────────────────────────────────────────────────

/** A wiki domain — a self-contained knowledge base for a specific topic */
export interface WikiDomain {
  /** URL-safe slug (e.g. "trading", "devops", "companion") */
  slug: string;
  /** Human-readable name */
  name: string;
  /** Absolute path to the domain directory */
  path: string;
  /** Number of compiled articles (excludes _index.md, _core.md) */
  articleCount: number;
  /** Total estimated tokens across all articles */
  totalTokens: number;
  /** ISO timestamp of last compilation */
  lastCompiledAt: string | null;
  /** Whether _core.md (L0 rules) exists */
  hasCore: boolean;
}

// ─── Article ────────────────────────────────────────────────────────────────

/** How much to trust this article's content */
export type ArticleConfidence = "extracted" | "inferred" | "ambiguous";

/** Frontmatter metadata for a wiki article */
export interface ArticleMeta {
  title: string;
  domain: string;
  /** Raw source files this article was compiled from */
  compiledFrom: string[];
  /** Model used for compilation */
  compiledBy: string;
  /** ISO timestamp */
  compiledAt: string;
  /** Estimated token count of the article body */
  tokens: number;
  /** Searchable tags */
  tags: string[];
  /** Whether this article was manually edited after compilation */
  manuallyEdited?: boolean;
  /** Trust level: extracted (from source), inferred (deduced), ambiguous (uncertain) */
  confidence?: ArticleConfidence;
  /** Link to original source (repo URL, doc URL, etc.) */
  sourceUrl?: string;
}

/** A complete wiki article (frontmatter + body) */
export interface WikiArticle {
  /** Filename slug (e.g. "entry-rules") */
  slug: string;
  /** Parsed frontmatter */
  meta: ArticleMeta;
  /** Markdown body content (without frontmatter) */
  content: string;
  /** Full file path */
  path: string;
}

/** Lightweight article reference (for index/listing) */
export interface ArticleRef {
  slug: string;
  title: string;
  tokens: number;
  tags: string[];
  compiledAt: string;
  confidence?: ArticleConfidence;
}

// ─── Index ──────────────────────────────────────────────────────────────────

/** Parsed _index.md metadata */
export interface WikiIndex {
  domain: string;
  articleCount: number;
  totalTokens: number;
  lastCompiledAt: string | null;
  /** List of article references */
  articles: ArticleRef[];
  /** Core rules summary (first 200 chars of _core.md, if exists) */
  coreSummary: string | null;
}

// ─── Compiler ───────────────────────────────────────────────────────────────

/** Input for the LLM compiler */
export interface CompileRequest {
  domain: string;
  /** If set, only recompile these specific raw files */
  rawFiles?: string[];
  /** Model to use for compilation (default: configured model) */
  model?: string;
  /** Whether to overwrite existing articles or only create new ones */
  overwrite?: boolean;
}

/** Result of a compilation run */
export interface CompileResult {
  domain: string;
  /** Articles created or updated */
  articlesWritten: ArticleRef[];
  /** Raw files that were processed */
  rawFilesProcessed: string[];
  /** Raw files that failed to process */
  errors: Array<{ file: string; error: string }>;
  /** Total tokens in newly written articles */
  totalTokens: number;
  /** Duration in milliseconds */
  durationMs: number;
}

// ─── Retrieval ──────────────────────────────────────────────────────────────

/** Search result from keyword search */
export interface SearchResult {
  slug: string;
  title: string;
  tokens: number;
  /** Relevance score (0-1) */
  score: number;
  /** Matched snippet (first match context) */
  snippet: string;
}

/** Budget-aware retrieval request */
export interface RetrievalRequest {
  domain: string;
  /** Task description or query for article selection */
  query: string;
  /** Maximum total tokens to return (default: 5000) */
  tokenBudget?: number;
  /** Whether to include _core.md in the response */
  includeCore?: boolean;
}

/** Budget-aware retrieval result */
export interface RetrievalResult {
  /** Always included: _index.md content */
  index: string;
  /** Included if requested and exists */
  core: string | null;
  /** Selected articles (within budget) */
  articles: WikiArticle[];
  /** Total tokens returned */
  totalTokens: number;
  /** Articles that were relevant but excluded due to budget */
  truncated: ArticleRef[];
}

// ─── Raw Material ───────────────────────────────────────────────────────────

/** A raw source file in the wiki/raw/ directory */
export interface RawFile {
  /** Filename */
  name: string;
  /** File extension */
  ext: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modified timestamp */
  modifiedAt: string;
  /** Whether this file has been compiled into articles */
  compiled: boolean;
}

// ─── Config ─────────────────────────────────────────────────────────────────

/** Wiki settings stored in the settings DB */
export interface WikiConfig {
  /** Root directory for all wiki domains (default: "wiki" relative to CWD) */
  rootPath: string;
  /** Default domain to load for sessions (null = none) */
  defaultDomain: string | null;
  /** Secondary domains — only indexes injected in L0 for cross-domain routing */
  secondaryDomains: string[];
  /** Whether wiki feature is enabled */
  enabled: boolean;
}

export const DEFAULT_WIKI_CONFIG: WikiConfig = {
  rootPath: "wiki",
  defaultDomain: null,
  secondaryDomains: [],
  enabled: true,
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Characters per token estimate (rough average for English + code) */
export const CHARS_PER_TOKEN = 4;

/** Maximum article size in tokens (articles exceeding this should be split) */
export const MAX_ARTICLE_TOKENS = 5000;

/** Maximum core rules size in tokens */
export const MAX_CORE_TOKENS = 3000;

/** Reserved filenames in a domain directory */
export const RESERVED_FILES = ["_index.md", "_core.md"] as const;

/** Supported raw file extensions */
export const RAW_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".yaml",
  ".yml",
  ".log",
  ".xml",
  ".html",
  ".pdf",
  ".url",
]);
