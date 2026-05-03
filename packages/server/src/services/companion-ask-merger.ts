/**
 * Source merger for `companion_ask` — reranks heterogeneous results
 * (wiki articles + code symbols) into one ordered list. No ML; a
 * deterministic score blend keeps results predictable + cheap.
 */

export type AskSourceType = "wiki" | "code";

export interface AskSource {
  /** Provenance — drives source-priority weighting. */
  type: AskSourceType;
  /** Stable id within the source type (wiki slug, codegraph symbol id, …). */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Short snippet for the answer body. */
  snippet: string;
  /** Layer-local score in [0, 1]. */
  score: number;
  /** Optional reference path / fully-qualified name. */
  reference?: string;
}

interface RerankOptions {
  question: string;
  /** Cap on how many sources survive rerank. Default 8. */
  topK?: number;
}

/** Source-priority weight (typed) — wiki articles outrank code symbols. */
const TYPE_PRIORITY: Record<AskSourceType, number> = {
  wiki: 1.0,
  code: 0.85,
};

/** Tokenise the question into informative terms (length > 2, ASCII alnum). */
export function extractTerms(question: string): string[] {
  const stopwords = new Set([
    "the", "and", "for", "with", "what", "how", "why", "when", "where", "does",
    "did", "is", "are", "was", "were", "this", "that", "these", "those", "from",
    "into", "onto", "but", "not", "you", "your", "our", "out", "all", "any",
    "can", "will", "would", "should", "could", "have", "has", "had",
  ]);
  return question
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length > 2 && !stopwords.has(t));
}

/** Compute a final blended score per source, then sort + cap. */
export function rerank(sources: AskSource[], opts: RerankOptions): AskSource[] {
  const terms = extractTerms(opts.question);
  const topK = opts.topK ?? 8;

  const scored = sources.map((src) => {
    const overlap = countTermOverlap(src, terms);
    const overlapScore = terms.length > 0 ? overlap / terms.length : 0;
    const blended = 0.6 * src.score + 0.3 * TYPE_PRIORITY[src.type] + 0.1 * overlapScore;
    return { ...src, score: clamp01(blended) };
  });

  // Stable sort — ties broken by source type priority then id alphabetic.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (TYPE_PRIORITY[b.type] !== TYPE_PRIORITY[a.type]) {
      return TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type];
    }
    return a.id.localeCompare(b.id);
  });

  // Dedupe by (type, id) — defensive in case caller emits duplicates.
  const seen = new Set<string>();
  const out: AskSource[] = [];
  for (const src of scored) {
    const key = `${src.type}:${src.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(src);
    if (out.length >= topK) break;
  }
  return out;
}

function countTermOverlap(src: AskSource, terms: string[]): number {
  if (terms.length === 0) return 0;
  const haystack = `${src.title} ${src.snippet}`.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) hits += 1;
  }
  return hits;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
