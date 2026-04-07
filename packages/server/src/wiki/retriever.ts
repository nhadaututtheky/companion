/**
 * Wiki Retriever — Context-loading retrieval for wiki articles.
 *
 * NOT RAG. Loads full articles based on index + agent selection.
 * Budget-aware: respects token limits when selecting articles.
 */

import { createLogger } from "../logger.js";
import {
  readIndex,
  readCore,
  readArticle,
  listArticles,
} from "./store.js";
import {
  type WikiIndex,
  type WikiArticle,
  type SearchResult,
  type RetrievalRequest,
  type RetrievalResult,
  type ArticleRef,
  CHARS_PER_TOKEN,
} from "./types.js";

const log = createLogger("wiki:retriever");

// ─── Index + Core (always loaded) ───────────────────────────────────────────

/** Get domain index — always loaded at session start (~500-1K tokens) */
export function getIndex(domain: string, cwd?: string): WikiIndex | null {
  return readIndex(domain, cwd);
}

/** Get core rules — always loaded at session start (~2-3K tokens) */
export function getCore(domain: string, cwd?: string): string | null {
  return readCore(domain, cwd);
}

/**
 * Get the "always-loaded" context for session injection.
 * Returns index + core combined, within budget.
 */
export function getSessionContext(domain: string, tokenBudget: number, cwd?: string): {
  content: string;
  tokens: number;
} | null {
  const index = readIndex(domain, cwd);
  if (!index) return null;

  const parts: string[] = [];
  let tokens = 0;

  // Build index summary (compact, not full _index.md)
  const indexSummary = formatIndexForContext(index);
  const indexTokens = Math.ceil(indexSummary.length / CHARS_PER_TOKEN);

  if (indexTokens > tokenBudget) {
    // Even index doesn't fit — return truncated
    const truncated = indexSummary.slice(0, tokenBudget * CHARS_PER_TOKEN);
    return { content: truncated, tokens: tokenBudget };
  }

  parts.push(indexSummary);
  tokens += indexTokens;

  // Add core rules if within budget
  const core = readCore(domain, cwd);
  if (core) {
    const coreTokens = Math.ceil(core.length / CHARS_PER_TOKEN);
    if (tokens + coreTokens <= tokenBudget) {
      parts.push(`\n## Core Rules\n\n${core}`);
      tokens += coreTokens;
    } else {
      // Truncate core to fit
      const remaining = (tokenBudget - tokens) * CHARS_PER_TOKEN;
      if (remaining > 200) {
        parts.push(`\n## Core Rules (truncated)\n\n${core.slice(0, remaining)}\n\n[...truncated, use wiki_read for full content]`);
        tokens = tokenBudget;
      }
    }
  }

  return {
    content: parts.join("\n"),
    tokens,
  };
}

function formatIndexForContext(index: WikiIndex): string {
  const lines = [
    `## Wiki: ${index.domain} (${index.articleCount} articles, ${index.totalTokens} tokens)`,
    "",
  ];

  if (index.articles.length === 0) {
    lines.push("*No articles compiled yet.*");
  } else {
    for (const a of index.articles) {
      const tags = a.tags.length > 0 ? ` [${a.tags.join(", ")}]` : "";
      lines.push(`- **${a.title}** (${a.slug}) — ${a.tokens}t${tags}`);
    }
  }

  return lines.join("\n");
}

// ─── Keyword Search ─────────────────────────────────────────────────────────

/**
 * Search articles by keyword (title, tags, content).
 * Simple text matching — no embeddings needed at <100 articles scale.
 */
export function searchArticles(domain: string, query: string, cwd?: string): SearchResult[] {
  const articles = listArticles(domain, cwd);
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  if (queryTerms.length === 0) return [];

  const results: SearchResult[] = [];

  for (const ref of articles) {
    let score = 0;
    const titleLower = ref.title.toLowerCase();
    const tagsLower = ref.tags.map((t) => t.toLowerCase());

    for (const term of queryTerms) {
      // Title match (highest weight)
      if (titleLower.includes(term)) score += 0.4;
      // Tag match
      if (tagsLower.some((t) => t.includes(term))) score += 0.3;
      // Slug match
      if (ref.slug.includes(term)) score += 0.2;
    }

    // Normalize by number of terms
    score = Math.min(score / queryTerms.length, 1.0);

    if (score > 0) {
      // Read content for snippet if score is decent
      let snippet = "";
      if (score >= 0.2) {
        const article = readArticle(domain, ref.slug, cwd);
        if (article) {
          snippet = extractSnippet(article.content, queryTerms);
          // Boost score if content matches
          const contentLower = article.content.toLowerCase();
          for (const term of queryTerms) {
            if (contentLower.includes(term)) score = Math.min(score + 0.1, 1.0);
          }
        }
      }

      results.push({
        slug: ref.slug,
        title: ref.title,
        tokens: ref.tokens,
        score,
        snippet,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/** Extract a snippet around the first match */
function extractSnippet(content: string, terms: string[]): string {
  const contentLower = content.toLowerCase();

  for (const term of terms) {
    const idx = contentLower.indexOf(term);
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(content.length, idx + term.length + 80);
      const prefix = start > 0 ? "..." : "";
      const suffix = end < content.length ? "..." : "";
      return prefix + content.slice(start, end).replace(/\n/g, " ").trim() + suffix;
    }
  }

  // No match in content — return first 160 chars
  return content.slice(0, 160).replace(/\n/g, " ").trim() + "...";
}

// ─── Budget-Aware Retrieval ─────────────────────────────────────────────────

/**
 * Retrieve relevant articles within a token budget.
 *
 * Strategy: load index (always) → rank articles by query relevance →
 * load full articles until budget exhausted.
 */
export function retrieve(request: RetrievalRequest, cwd?: string): RetrievalResult {
  const { domain, query, tokenBudget = 5000, includeCore = true } = request;
  let remaining = tokenBudget;

  // Always include index
  const index = readIndex(domain, cwd);
  const indexContent = index ? formatIndexForContext(index) : `*Domain "${domain}" not found.*`;
  const indexTokens = Math.ceil(indexContent.length / CHARS_PER_TOKEN);
  remaining -= indexTokens;

  // Include core if requested
  let coreContent: string | null = null;
  if (includeCore) {
    const core = readCore(domain, cwd);
    if (core) {
      const coreTokens = Math.ceil(core.length / CHARS_PER_TOKEN);
      if (coreTokens <= remaining) {
        coreContent = core;
        remaining -= coreTokens;
      }
    }
  }

  // Search and rank articles
  const searchResults = searchArticles(domain, query, cwd);
  const selectedArticles: WikiArticle[] = [];
  const truncated: ArticleRef[] = [];

  for (const result of searchResults) {
    if (remaining <= 0) {
      truncated.push({
        slug: result.slug,
        title: result.title,
        tokens: result.tokens,
        tags: [],
        compiledAt: "",
      });
      continue;
    }

    const article = readArticle(domain, result.slug, cwd);
    if (!article) continue;

    if (article.meta.tokens <= remaining) {
      selectedArticles.push(article);
      remaining -= article.meta.tokens;
    } else {
      truncated.push({
        slug: result.slug,
        title: result.title,
        tokens: result.tokens,
        tags: article.meta.tags,
        compiledAt: article.meta.compiledAt,
      });
    }
  }

  const totalTokens = tokenBudget - remaining;

  log.debug("Retrieval complete", {
    domain,
    query: query.slice(0, 50),
    articlesLoaded: selectedArticles.length,
    truncated: truncated.length,
    totalTokens,
  });

  return {
    index: indexContent,
    core: coreContent,
    articles: selectedArticles,
    totalTokens,
    truncated,
  };
}
