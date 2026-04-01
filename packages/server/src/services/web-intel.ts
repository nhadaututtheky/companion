/**
 * WebIntel — Web intelligence service for Companion.
 * Wraps webclaw REST API (Docker sidecar) for web scraping, docs, and research.
 * All methods are safe to call when webclaw is unavailable — they return null/empty.
 */

import { createLogger } from "../logger.js";
import { scrapeCache, CACHE_TTL, type ScrapeResult } from "./web-intel-cache.js";

const log = createLogger("web-intel");

/** Default webclaw sidecar URL (internal Docker network) */
const WEBCLAW_URL = process.env.WEBCLAW_URL ?? "http://webclaw:3100";
const WEBCLAW_API_KEY = process.env.WEBCLAW_API_KEY ?? "";

/** Timeout for webclaw requests */
const SCRAPE_TIMEOUT_MS = 10_000;
const HEALTH_TIMEOUT_MS = 2_000;

// ─── SSRF Protection ────────────────────────────────────────────────────────

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^metadata\.google/i,
  /^169\.254\.169\.254$/,
];

/**
 * Validate URL is safe to fetch — blocks private/internal addresses (SSRF protection).
 * Throws if URL is unsafe.
 */
export function assertSafeUrl(url: string): void {
  const parsed = new URL(url);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }

  const host = parsed.hostname.toLowerCase();
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(host)) {
      throw new Error("Private/internal addresses are not allowed");
    }
  }
}

/** Health check cache — avoid hammering webclaw */
let healthCache: { available: boolean; checkedAt: number } | null = null;
const HEALTH_CACHE_TTL_MS = 30_000;

// ─── Health Check ───────────────────────────────────────────────────────────

/**
 * Check if webclaw sidecar is available.
 * Result cached for 30 seconds to avoid hammering.
 */
export async function isAvailable(): Promise<boolean> {
  if (healthCache && Date.now() - healthCache.checkedAt < HEALTH_CACHE_TTL_MS) {
    return healthCache.available;
  }

  try {
    const res = await fetch(`${WEBCLAW_URL}/v1/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const available = res.ok;
    healthCache = { available, checkedAt: Date.now() };
    return available;
  } catch {
    healthCache = { available: false, checkedAt: Date.now() };
    return false;
  }
}

/** Force reset health cache (e.g., after config change) */
export function resetHealthCache(): void {
  healthCache = null;
}

// ─── Scrape ─────────────────────────────────────────────────────────────────

export interface ScrapeOptions {
  /** Output formats (default: ["llm"]) */
  formats?: ("markdown" | "llm" | "text" | "json")[];
  /** CSS selectors to include */
  includeSelectors?: string[];
  /** CSS selectors to exclude */
  excludeSelectors?: string[];
  /** Only extract main content (default: true) */
  onlyMainContent?: boolean;
  /** Cache TTL override in ms */
  cacheTtlMs?: number;
  /** Skip cache and fetch fresh */
  skipCache?: boolean;
}

/**
 * Scrape a URL via webclaw. Returns null if webclaw unavailable or scrape fails.
 */
export async function scrape(url: string, opts?: ScrapeOptions): Promise<ScrapeResult | null> {
  // SSRF protection
  try {
    assertSafeUrl(url);
  } catch (err) {
    log.warn("SSRF blocked", { url, error: String(err) });
    return null;
  }

  const formats = opts?.formats ?? ["llm"];
  const cacheKey = JSON.stringify({ url, formats });

  // Check cache first
  if (!opts?.skipCache) {
    const cached = scrapeCache.get(cacheKey);
    if (cached) return cached;
  }

  if (!(await isAvailable())) {
    log.debug("webclaw unavailable, skipping scrape", { url });
    return null;
  }

  try {
    const body = {
      url,
      formats,
      only_main_content: opts?.onlyMainContent ?? true,
      ...(opts?.includeSelectors ? { include_selectors: opts.includeSelectors } : {}),
      ...(opts?.excludeSelectors ? { exclude_selectors: opts.excludeSelectors } : {}),
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (WEBCLAW_API_KEY) {
      headers["Authorization"] = `Bearer ${WEBCLAW_API_KEY}`;
    }

    const res = await fetch(`${WEBCLAW_URL}/v1/scrape`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log.warn("webclaw scrape failed", { url, status: res.status, error: errText });
      return null;
    }

    const data = await res.json() as ScrapeResult;
    const result: ScrapeResult = {
      url: data.url ?? url,
      metadata: data.metadata ?? {},
      markdown: data.markdown,
      llm: data.llm,
      text: data.text,
      error: data.error,
    };

    // Cache the result
    const ttl = opts?.cacheTtlMs ?? CACHE_TTL.general;
    scrapeCache.set(cacheKey, result, ttl);

    log.debug("Scraped successfully", {
      url,
      wordCount: result.metadata.wordCount,
      formats,
    });

    return result;
  } catch (err) {
    log.warn("webclaw scrape error", { url, error: String(err) });
    return null;
  }
}

/**
 * Scrape a URL and return token-budgeted content string for agent injection.
 * Returns null if unavailable or content is empty.
 */
export async function scrapeForContext(
  url: string,
  maxTokens = 2000,
  opts?: ScrapeOptions,
): Promise<string | null> {
  const result = await scrape(url, { formats: ["llm"], ...opts });
  if (!result) return null;

  const content = result.llm ?? result.markdown ?? result.text;
  if (!content || content.trim().length === 0) return null;

  // Rough token estimation: ~4 chars per token for English
  const maxChars = maxTokens * 4;

  if (content.length <= maxChars) return content;

  // Truncate with indicator
  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf("\n");
  const cleanCut = lastNewline > maxChars * 0.8 ? truncated.slice(0, lastNewline) : truncated;

  return `${cleanCut}\n\n... [truncated — full docs at ${url}]`;
}

// ─── Batch Scrape ───────────────────────────────────────────────────────────

export interface BatchOptions {
  formats?: ("markdown" | "llm" | "text" | "json")[];
  concurrency?: number;
}

/**
 * Scrape multiple URLs concurrently via webclaw batch endpoint.
 */
export async function batchScrape(
  urls: string[],
  opts?: BatchOptions,
): Promise<ScrapeResult[]> {
  if (urls.length === 0) return [];

  // SSRF protection — validate every URL before sending to webclaw
  const safeUrls: string[] = [];
  for (const url of urls) {
    try {
      assertSafeUrl(url);
      safeUrls.push(url);
    } catch {
      log.warn("SSRF blocked in batch", { url });
    }
  }
  if (safeUrls.length === 0) return [];

  if (!(await isAvailable())) return [];

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (WEBCLAW_API_KEY) {
      headers["Authorization"] = `Bearer ${WEBCLAW_API_KEY}`;
    }

    const res = await fetch(`${WEBCLAW_URL}/v1/batch`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        urls: safeUrls,
        formats: opts?.formats ?? ["llm"],
        concurrency: opts?.concurrency ?? 5,
      }),
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS * 3),
    });

    if (!res.ok) return [];

    const data = await res.json() as { results: ScrapeResult[] };
    return data.results ?? [];
  } catch (err) {
    log.warn("webclaw batch scrape error", { error: String(err) });
    return [];
  }
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

/**
 * Web search via webclaw. Requires WEBCLAW_API_KEY.
 */
export async function search(
  query: string,
  numResults = 5,
): Promise<SearchResult[]> {
  if (!WEBCLAW_API_KEY) {
    log.debug("Web search requires WEBCLAW_API_KEY");
    return [];
  }
  if (!(await isAvailable())) return [];

  try {
    const res = await fetch(`${WEBCLAW_URL}/v1/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WEBCLAW_API_KEY}`,
      },
      body: JSON.stringify({ query, num: numResults }),
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const data = await res.json() as { results: SearchResult[] };
    return data.results ?? [];
  } catch (err) {
    log.warn("webclaw search error", { error: String(err) });
    return [];
  }
}

// ─── Crawl ──────────────────────────────────────────────────────────────────

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  useSitemap?: boolean;
}

export interface CrawlJob {
  id: string;
  status: "running" | "completed" | "failed";
  pages?: ScrapeResult[];
  totalPages?: number;
  error?: string;
}

/**
 * Start an async crawl job via webclaw.
 * Returns the job ID for polling status.
 */
export async function startCrawl(url: string, opts?: CrawlOptions): Promise<string | null> {
  try {
    assertSafeUrl(url);
  } catch {
    return null;
  }

  if (!(await isAvailable())) return null;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (WEBCLAW_API_KEY) {
      headers["Authorization"] = `Bearer ${WEBCLAW_API_KEY}`;
    }

    const res = await fetch(`${WEBCLAW_URL}/v1/crawl`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        max_depth: opts?.maxDepth ?? 2,
        max_pages: opts?.maxPages ?? 50,
        use_sitemap: opts?.useSitemap ?? false,
      }),
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = await res.json() as { id: string };
    return data.id ?? null;
  } catch (err) {
    log.warn("webclaw crawl start error", { url, error: String(err) });
    return null;
  }
}

/**
 * Poll crawl job status.
 */
export async function getCrawlStatus(jobId: string): Promise<CrawlJob | null> {
  if (!(await isAvailable())) return null;

  try {
    const headers: Record<string, string> = {};
    if (WEBCLAW_API_KEY) {
      headers["Authorization"] = `Bearer ${WEBCLAW_API_KEY}`;
    }

    const res = await fetch(`${WEBCLAW_URL}/v1/crawl/${encodeURIComponent(jobId)}`, {
      headers,
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    return await res.json() as CrawlJob;
  } catch {
    return null;
  }
}

// ─── Research (search + scrape + summarize) ─────────────────────────────────

/**
 * Perform web research: search → scrape top results → return combined content.
 * Requires WEBCLAW_API_KEY for search. Falls back to scraping provided URL if no search available.
 */
export async function research(
  query: string,
  maxTokens = 3000,
): Promise<{ content: string; sources: { title: string; url: string }[] } | null> {
  // Search for relevant URLs
  const searchResults = await search(query, 5);

  if (searchResults.length === 0) {
    log.debug("Research: no search results", { query });
    return null;
  }

  // Scrape top results
  const urls = searchResults.map((r) => r.url);
  const scrapeResults = await batchScrape(urls, { formats: ["llm"], concurrency: 3 });

  const validResults = scrapeResults.filter(
    (r) => !r.error && (r.llm ?? r.markdown ?? r.text),
  );

  if (validResults.length === 0) return null;

  // Combine content with source attribution
  const maxCharsPerSource = Math.floor((maxTokens * 4) / validResults.length);
  const sections: string[] = [];
  const sources: { title: string; url: string }[] = [];

  for (let i = 0; i < validResults.length; i++) {
    const result = validResults[i]!;
    const content = result.llm ?? result.markdown ?? result.text ?? "";
    const title = result.metadata?.title ?? `Source ${i + 1}`;
    const truncated = content.length > maxCharsPerSource
      ? content.slice(0, maxCharsPerSource) + "..."
      : content;

    sections.push(`### ${title}\nSource: ${result.url}\n\n${truncated}`);
    sources.push({ title, url: result.url });
  }

  const combinedContent = sections.join("\n\n---\n\n");

  return { content: combinedContent, sources };
}

// ─── Convenience ────────────────────────────────────────────────────────────

/**
 * Get cache stats for monitoring.
 */
export function getCacheStats() {
  return scrapeCache.stats();
}

/**
 * Clear all cached data.
 */
export function clearCache() {
  scrapeCache.clear();
}

/**
 * Invalidate cached entries matching a URL pattern.
 */
export function invalidateCache(urlPattern: string | RegExp) {
  return scrapeCache.invalidate(urlPattern);
}
