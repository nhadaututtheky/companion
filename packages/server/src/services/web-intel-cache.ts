/**
 * WebIntel Cache — LRU in-memory cache for web scrape results.
 * Keyed by URL + format hash, with configurable TTL per entry.
 */

import { createLogger } from "../logger.js";

const log = createLogger("web-intel-cache");

const MAX_ENTRIES = 200;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  insertedAt: number;
  lastAccessedAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

export class WebIntelCache<T = string> {
  private store = new Map<string, CacheEntry<T>>();
  private hits = 0;
  private misses = 0;

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    entry.lastAccessedAt = Date.now();
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    // Evict oldest entries if at capacity
    if (this.store.size >= MAX_ENTRIES && !this.store.has(key)) {
      this.evictOldest(Math.floor(MAX_ENTRIES * 0.1));
    }

    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + ttlMs,
      insertedAt: now,
      lastAccessedAt: now,
    });
  }

  invalidate(urlPattern: string | RegExp): number {
    const pattern =
      typeof urlPattern === "string"
        ? new RegExp(urlPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        : urlPattern;

    let removed = 0;
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      log.debug("Cache invalidated", { pattern: String(pattern), removed });
    }
    return removed;
  }

  stats(): CacheStats {
    // Prune expired entries on stats check
    this.pruneExpired();

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      maxSize: MAX_ENTRIES,
    };
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  private evictOldest(count: number): void {
    const entries = [...this.store.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
    );

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      this.store.delete(entries[i]![0]);
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

/** Shared cache instance for web scrape results */
export const scrapeCache = new WebIntelCache<ScrapeResult>();

/** Cache TTLs */
export const CACHE_TTL = {
  docs: 60 * 60 * 1000, // 1 hour
  research: 15 * 60 * 1000, // 15 minutes
  crawl: 30 * 60 * 1000, // 30 minutes
  general: 30 * 60 * 1000, // 30 minutes
} as const;

export interface ScrapeResult {
  url: string;
  metadata: {
    title?: string;
    description?: string;
    author?: string;
    language?: string;
    wordCount?: number;
  };
  markdown?: string;
  llm?: string;
  text?: string;
  error?: string;
}
