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
} from "./store.js";

// Compiler (raw → articles)
export { compileWiki } from "./compiler.js";

// Feedback loop (session findings → raw)
export { saveSessionFindings } from "./feedback.js";

// Retriever (context-loading)
export {
  getIndex,
  getCore,
  getSessionContext,
  searchArticles,
  retrieve,
} from "./retriever.js";

// Types
export type {
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
} from "./types.js";

export {
  DEFAULT_WIKI_CONFIG,
  CHARS_PER_TOKEN,
  MAX_ARTICLE_TOKENS,
  MAX_CORE_TOKENS,
  RESERVED_FILES,
  RAW_EXTENSIONS,
} from "./types.js";
