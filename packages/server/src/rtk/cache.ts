/**
 * RTK Cross-Turn Output Cache
 *
 * Caches compressed outputs by content hash to avoid re-processing
 * identical tool outputs within the same session.
 *
 * Uses a bounded LRU-style cache per session with TTL expiry.
 */

/** Max entries per session cache */
const MAX_ENTRIES = 100;

/** Cache entry TTL: 10 minutes */
const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  compressed: string;
  tokensSaved: number;
  strategiesApplied: string[];
  timestamp: number;
  /** Original input length — used to detect hash collisions */
  inputLength: number;
}

import { createHash } from "crypto";

/**
 * SHA-256 truncated to 64 bits (16 hex chars) for cache keys.
 * Much lower collision risk than FNV-1a 32-bit while still fast for cache use.
 */
function contentHash(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

export class RTKCache {
  /** sessionId → (hash → entry) */
  private readonly sessions = new Map<string, Map<string, CacheEntry>>();

  /** Total cache hits across all sessions */
  private hits = 0;
  /** Total cache misses */
  private misses = 0;

  /**
   * Look up a cached result for this input.
   * Returns the cached entry or undefined on miss.
   */
  get(sessionId: string, input: string): CacheEntry | undefined {
    const sessionCache = this.sessions.get(sessionId);
    if (!sessionCache) {
      this.misses++;
      return undefined;
    }

    const hash = contentHash(input);
    const entry = sessionCache.get(hash);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > TTL_MS) {
      sessionCache.delete(hash);
      this.misses++;
      return undefined;
    }

    // Verify input length to detect hash collisions
    if (entry.inputLength !== input.length) {
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry;
  }

  /**
   * Store a compressed result in the cache.
   */
  set(
    sessionId: string,
    input: string,
    compressed: string,
    tokensSaved: number,
    strategiesApplied: string[],
  ): void {
    let sessionCache = this.sessions.get(sessionId);
    if (!sessionCache) {
      sessionCache = new Map();
      this.sessions.set(sessionId, sessionCache);
    }

    // Evict oldest entries if at capacity
    if (sessionCache.size >= MAX_ENTRIES) {
      const oldestKey = sessionCache.keys().next().value;
      if (oldestKey !== undefined) {
        sessionCache.delete(oldestKey);
      }
    }

    const hash = contentHash(input);
    sessionCache.set(hash, {
      compressed,
      tokensSaved,
      strategiesApplied,
      timestamp: Date.now(),
      inputLength: input.length,
    });
  }

  /**
   * Clear cache for a specific session (on session end).
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get cache statistics.
   */
  getStats(): { hits: number; misses: number; sessions: number; totalEntries: number } {
    let totalEntries = 0;
    for (const cache of this.sessions.values()) {
      totalEntries += cache.size;
    }
    return {
      hits: this.hits,
      misses: this.misses,
      sessions: this.sessions.size,
      totalEntries,
    };
  }
}
