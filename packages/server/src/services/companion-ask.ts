/**
 * `companion_ask` orchestrator — Phase 3 of the harness layer.
 *
 * Single entry point that routes a natural-language question across
 * Wiki + CodeGraph in parallel, reranks the results, optionally
 * compresses the answer via RTK, and returns one structured response
 * with explicit `sources`. The agent uses ONE tool call instead of
 * choosing between three.
 */

import { searchArticles } from "../wiki/retriever.js";
import { findNodesByName } from "../codegraph/graph-store.js";
import { compressText } from "../rtk/api.js";
import { rerank, extractTerms, type AskSource } from "./companion-ask-merger.js";
import { createLogger } from "../logger.js";

const log = createLogger("companion-ask");

/** Total wall-clock budget for the orchestrator. */
const DEFAULT_TIMEOUT_MS = 5000;
/** Per-layer timeout (so one slow layer doesn't drag total above DEFAULT). */
const LAYER_TIMEOUT_MS = 3000;
/** Default token budget for the rendered answer body. */
const DEFAULT_MAX_TOKENS = 2000;
/** Maximum top terms passed to CodeGraph node search (one query each). */
const MAX_CODEGRAPH_TERMS = 2;
/** Minimum term length for CodeGraph search — `LIKE '%t%'` on 3-char terms
 * scans the whole project on every ask; require ≥4 chars to keep the hot
 * path bounded. (Wiki search already filters short terms internally.) */
const MIN_CODEGRAPH_TERM_LEN = 4;

export type AskScope = "code" | "docs" | "both";

export interface AskRequest {
  question: string;
  scope?: AskScope;
  maxTokens?: number;
  /** Project slug for CodeGraph; defaults from caller env. */
  projectSlug?: string;
  /** Wiki domain — defaults to projectSlug. */
  wikiDomain?: string;
  /** Cwd for filesystem-based wiki scan. */
  cwd?: string;
}

export interface AskResponse {
  answer: string;
  sources: AskSource[];
  durationMs: number;
  layers: { wiki: boolean; codegraph: boolean; compressed: boolean };
  /** True when at least one layer failed/timed-out but answer still produced. */
  partial: boolean;
}

export class NoSourcesError extends Error {
  readonly code = "no-sources";
  constructor(message: string) {
    super(message);
    this.name = "NoSourcesError";
  }
}

/**
 * Orchestrate the ask flow. Throws `NoSourcesError` only when both
 * layers fail AND the agent asked for both — partial data is preferred
 * over throwing.
 */
export async function companionAsk(req: AskRequest): Promise<AskResponse> {
  const started = Date.now();
  const scope: AskScope = req.scope ?? "both";
  const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;

  const wantWiki = scope === "docs" || scope === "both";
  const wantCode = scope === "code" || scope === "both";

  const wikiPromise = wantWiki ? withTimeout(searchWikiLayer(req), LAYER_TIMEOUT_MS) : SKIP;
  const codePromise = wantCode ? withTimeout(searchCodeLayer(req), LAYER_TIMEOUT_MS) : SKIP;

  const [wikiResult, codeResult] = await Promise.allSettled([wikiPromise, codePromise]);

  // wikiOk is meaningful only when the caller actually asked for wiki data;
  // explicit gate makes intent obvious to readers and audit-time grep.
  const wikiOk =
    wantWiki && wikiResult.status === "fulfilled" && wikiResult.value !== SKIP;
  const codeOk =
    wantCode && codeResult.status === "fulfilled" && codeResult.value !== SKIP;

  const wikiSources = wikiOk ? (wikiResult.value as AskSource[]) : [];
  const codeSources = codeOk ? (codeResult.value as AskSource[]) : [];

  if (!wikiOk && !codeOk) {
    log.debug("Both ask layers failed", {
      wiki: wikiResult.status === "rejected" ? wikiResult.reason : "skipped",
      code: codeResult.status === "rejected" ? codeResult.reason : "skipped",
    });
    throw new NoSourcesError(
      "No sources available. Wiki may be empty and CodeGraph may not be indexed for this project.",
    );
  }

  const merged = rerank([...wikiSources, ...codeSources], { question: req.question, topK: 8 });
  const partial = (wantWiki && !wikiOk) || (wantCode && !codeOk);

  // Format the answer body, then optionally fold via RTK.
  const rawAnswer = formatAnswer(req.question, merged, partial);
  const compressedResult = compressText(rawAnswer, {
    budgetTokens: maxTokens,
    toolName: "companion_ask",
  });

  return {
    answer: compressedResult.compressed,
    sources: merged,
    durationMs: Date.now() - started,
    layers: {
      wiki: wikiOk,
      codegraph: codeOk,
      compressed: compressedResult.strategiesApplied.length > 0,
    },
    partial,
  };
}

// ─── Layer searchers ────────────────────────────────────────────────────────

const SKIP = Symbol("ask-skipped");
type Skipped = typeof SKIP;

async function searchWikiLayer(req: AskRequest): Promise<AskSource[]> {
  const domain = req.wikiDomain ?? req.projectSlug ?? "default";
  // searchArticles is sync but wrap in Promise so withTimeout works uniformly.
  return Promise.resolve(searchArticles(domain, req.question, req.cwd)).then((rows) =>
    rows.slice(0, 5).map<AskSource>((r) => ({
      type: "wiki",
      id: r.slug,
      title: r.title,
      snippet: r.snippet || "",
      score: r.score,
      reference: `wiki:${domain}/${r.slug}`,
    })),
  );
}

async function searchCodeLayer(req: AskRequest): Promise<AskSource[]> {
  if (!req.projectSlug) return [];
  const terms = extractTerms(req.question)
    .filter((t) => t.length >= MIN_CODEGRAPH_TERM_LEN)
    .slice(0, MAX_CODEGRAPH_TERMS);
  if (terms.length === 0) return [];

  const seen = new Set<string>();
  const out: AskSource[] = [];
  let anySucceeded = false;

  for (const term of terms) {
    let nodes: ReturnType<typeof findNodesByName>;
    try {
      nodes = findNodesByName(req.projectSlug, term);
      anySucceeded = true;
    } catch (err) {
      log.debug("CodeGraph search failed", { term, error: String(err) });
      continue;
    }
    for (const node of nodes) {
      const key = `${node.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Score: term position in question (earlier = higher) + symbol-name match strength.
      const positionScore = 1 - terms.indexOf(term) / terms.length;
      const exactBonus =
        node.symbolName.toLowerCase() === term.toLowerCase() ? 0.2 : 0;
      out.push({
        type: "code",
        id: String(node.id),
        title: node.symbolName,
        snippet: node.signature ?? "",
        score: clamp01(0.5 + 0.4 * positionScore + exactBonus),
        reference: `code:${node.symbolName}`,
      });
      if (out.length >= 12) break; // hard cap so a popular name doesn't flood
    }
    if (out.length >= 12) break;
  }

  // If every per-term query threw, surface as a layer-level failure so
  // the orchestrator marks codegraph=false (partial) instead of "0 hits".
  if (!anySucceeded) {
    throw new Error("All CodeGraph queries failed");
  }

  return out;
}

// ─── Format ─────────────────────────────────────────────────────────────────

function formatAnswer(question: string, sources: AskSource[], partial: boolean): string {
  const lines: string[] = [];
  if (partial) {
    lines.push("**Note**: One source layer was unavailable; answer is partial.\n");
  }

  lines.push(`### Answer for: ${question.trim()}\n`);

  if (sources.length === 0) {
    lines.push("_No matching sources found._");
    return lines.join("\n");
  }

  // Synthesis pass: list top 3 with snippets, rest as bullet refs.
  const top = sources.slice(0, 3);
  const rest = sources.slice(3);

  for (const src of top) {
    lines.push(`#### [${src.type}:${sanitizeTitle(src.title)}]`);
    if (src.reference) lines.push(`*${src.reference}*`);
    if (src.snippet) lines.push(sanitizeSnippet(src.snippet));
    lines.push("");
  }

  if (rest.length > 0) {
    lines.push("**Other matches**:");
    for (const src of rest) {
      lines.push(`- [${src.type}] ${src.title}${src.reference ? ` — ${src.reference}` : ""}`);
    }
  }

  return lines.join("\n");
}

// ─── Sanitisation ───────────────────────────────────────────────────────────

const MAX_SNIPPET_CHARS = 240;

/** Strip code fences + heading markers from a snippet so it can't break
 * the answer's outer markdown structure. The agent only needs the gist. */
function sanitizeSnippet(raw: string): string {
  let s = raw.trim().replace(/```/g, "ʼʼʼ"); // visually similar, structurally inert
  s = s.replace(/\n#{1,6}\s/g, "\n"); // strip leading heading markers on new lines
  if (s.length > MAX_SNIPPET_CHARS) s = s.slice(0, MAX_SNIPPET_CHARS - 1) + "…";
  return s;
}

/** Single-line title with no markdown control chars. */
function sanitizeTitle(raw: string): string {
  return raw.replace(/[`\[\]\n\r]+/g, "").trim().slice(0, 120);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | Skipped> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<Skipped>((resolve) => {
    timer = setTimeout(() => resolve(SKIP), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Test seam — total budget is the max of layer budgets + format/compress overhead. */
export const _internals = {
  DEFAULT_TIMEOUT_MS,
  LAYER_TIMEOUT_MS,
  formatAnswer,
};
