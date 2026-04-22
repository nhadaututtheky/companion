/**
 * Wiki Knowledge Base — Public API surface.
 */

// Store (filesystem CRUD)
export {
  getWikiConfig,
  setWikiConfig,
  resolveWikiRoot,
  listDomains,
  createDomain,
  deleteDomain,
  readArticle,
  writeArticle,
  deleteArticle,
  listArticles,
  readCore,
  writeCore,
  readIndex,
  rebuildIndex,
  listRawFiles,
  readRawFile,
  writeRawFile,
  deleteRawFile,
  writeNote,
  flagStale,
  getFlaggedArticles,
  clearFlags,
  readChangelog,
  readPreviousVersion,
  type NeedsUpdateEntry,
} from "./store.js";

// Compiler (raw → articles)
export { compileWiki } from "./compiler.js";

// Feedback loop (session findings → raw)
export { saveSessionFindings } from "./feedback.js";

// Bootstrap (config persistence + auto-provision)
export {
  initWikiConfig,
  loadWikiConfigFromDb,
  persistWikiConfigToDb,
  autoProvisionDefaultDomain,
} from "./bootstrap.js";

// Query archive (self-archiving queries)
export { archiveQuery } from "./query-archive.js";

// Linter (freshness checks)
export { lintDomain } from "./linter.js";
export type { LintIssue, LintResult, LintSeverity } from "./linter.js";

// Retriever (context-loading)
export {
  getIndex,
  getCore,
  getSessionContext,
  searchArticles,
  searchWithCodeGraph,
  retrieve,
  formatIndexForContext,
} from "./retriever.js";

// Types
export type {
  ArticleConfidence,
  WikiDomain,
  WikiArticle,
  ArticleMeta,
  ArticleRef,
  WikiIndex,
  CompileRequest,
  CompileResult,
  SearchResult,
  RetrievalRequest,
  RetrievalResult,
  RawFile,
  WikiConfig,
  WriteContext,
  ChangelogEntry,
} from "./types.js";

export {
  DEFAULT_WIKI_CONFIG,
  CHARS_PER_TOKEN,
  MAX_ARTICLE_TOKENS,
  MAX_CORE_TOKENS,
  RESERVED_FILES,
  RAW_EXTENSIONS,
} from "./types.js";
