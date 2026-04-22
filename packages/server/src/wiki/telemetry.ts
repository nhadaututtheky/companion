/**
 * Wiki consumption telemetry — in-memory counters so we can answer
 * "are agents actually using the wiki?" without a new DB migration.
 *
 * Mirrors codegraph/telemetry.ts in spirit but intentionally simpler: we
 * care about adoption signal (hit rate, tokens delivered, note-write rate)
 * more than slow-query analysis. If we need persistence later, drop the
 * rows into the existing `codeQueryLog` table with a `wiki.*` queryType
 * prefix rather than a new table.
 *
 * Exposed via GET /api/wiki/stats so bro can see in a browser whether the
 * 5-commit Wiki pipeline is actually producing agent interactions.
 */

import { createLogger } from "../logger.js";

const log = createLogger("wiki:telemetry");

// ─── Event types ────────────────────────────────────────────────────────────

export type WikiOpType =
  | "search" // wiki_search tool call / POST /wiki/:d/query mode=search
  | "search_hit" // search returned ≥1 result
  | "search_miss" // search returned 0 results
  | "read" // wiki_read tool call / GET /wiki/:d/articles/:slug
  | "read_hit" // article existed
  | "read_miss" // 404 / not found
  | "note" // wiki_note tool call
  | "l0_inject" // Wiki L0 context successfully delivered to Claude
  | "l0_skip" // L0 injection attempted but no content available
  | "compile_run" // compileWiki invoked
  | "compile_article"; // each article produced by compileWiki

export interface WikiOpEvent {
  type: WikiOpType;
  domain?: string;
  /** Tokens delivered (for l0_inject) or returned (for search/read), if known. */
  tokens?: number;
  /** Source hint: "mcp" (agent), "web" (UI), "telegram". */
  source?: string;
}

// ─── Counters ───────────────────────────────────────────────────────────────

interface Counters {
  total: Record<WikiOpType, number>;
  byDomain: Map<string, Record<WikiOpType, number>>;
  tokensDelivered: number; // cumulative L0 tokens sent to agents
  tokensReturned: number; // cumulative search/read response tokens
  firstSeenAt: string;
  lastSeenAt: string | null;
}

function emptyRow(): Record<WikiOpType, number> {
  return {
    search: 0,
    search_hit: 0,
    search_miss: 0,
    read: 0,
    read_hit: 0,
    read_miss: 0,
    note: 0,
    l0_inject: 0,
    l0_skip: 0,
    compile_run: 0,
    compile_article: 0,
  };
}

let counters: Counters = {
  total: emptyRow(),
  byDomain: new Map(),
  tokensDelivered: 0,
  tokensReturned: 0,
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: null,
};

// ─── Recording ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget. Never throws, never blocks. Safe to call from hot paths.
 */
export function recordWikiOp(event: WikiOpEvent): void {
  try {
    counters.total[event.type] = (counters.total[event.type] ?? 0) + 1;

    if (event.domain) {
      let row = counters.byDomain.get(event.domain);
      if (!row) {
        row = emptyRow();
        counters.byDomain.set(event.domain, row);
      }
      row[event.type] = (row[event.type] ?? 0) + 1;
    }

    if (event.tokens && event.tokens > 0) {
      if (event.type === "l0_inject") counters.tokensDelivered += event.tokens;
      else if (event.type === "search" || event.type === "read") {
        counters.tokensReturned += event.tokens;
      }
    }

    counters.lastSeenAt = new Date().toISOString();
  } catch (err) {
    log.debug("recordWikiOp failed", { error: String(err) });
  }
}

// ─── Reporting ──────────────────────────────────────────────────────────────

export interface WikiTelemetrySummary {
  firstSeenAt: string;
  lastSeenAt: string | null;
  totals: Record<WikiOpType, number>;
  hitRate: {
    search: number | null;
    read: number | null;
  };
  tokens: {
    deliveredToAgents: number;
    returnedBySearchRead: number;
  };
  perDomain: Array<{
    domain: string;
    counts: Record<WikiOpType, number>;
  }>;
}

export function getWikiStats(): WikiTelemetrySummary {
  const searchTotal = counters.total.search;
  const readTotal = counters.total.read;

  const perDomain = Array.from(counters.byDomain.entries())
    .map(([domain, counts]) => ({ domain, counts }))
    .sort((a, b) => {
      const aTot = sumRow(a.counts);
      const bTot = sumRow(b.counts);
      return bTot - aTot;
    });

  return {
    firstSeenAt: counters.firstSeenAt,
    lastSeenAt: counters.lastSeenAt,
    totals: { ...counters.total },
    hitRate: {
      search: searchTotal > 0 ? counters.total.search_hit / searchTotal : null,
      read: readTotal > 0 ? counters.total.read_hit / readTotal : null,
    },
    tokens: {
      deliveredToAgents: counters.tokensDelivered,
      returnedBySearchRead: counters.tokensReturned,
    },
    perDomain,
  };
}

function sumRow(row: Record<WikiOpType, number>): number {
  let sum = 0;
  for (const k of Object.keys(row) as WikiOpType[]) sum += row[k];
  return sum;
}

/** Reset counters — useful for tests and ops ("clear then observe"). */
export function resetWikiStats(): void {
  counters = {
    total: emptyRow(),
    byDomain: new Map(),
    tokensDelivered: 0,
    tokensReturned: 0,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: null,
  };
}
