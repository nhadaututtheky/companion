/**
 * Slim MCP tool set for agent sessions.
 *
 * Only registers tools that agents CANNOT replicate with built-in tools
 * (grep, glob, read). Keeps context overhead minimal (~3K tokens).
 *
 * Included:
 *  - Wiki KB (search, read, note) — no other way for agents to access
 *  - CodeGraph impact — blast radius analysis, not replicable by grep
 *  - Explain — unified wiki + codegraph context for a file (single call)
 *
 * Cross-references:
 *  - wiki_search returns related code symbols when codegraph is available
 *  - codegraph_impact returns related wiki articles when wiki has content
 *  - explain combines both into one response
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const API_BASE = process.env.COMPANION_API_URL ?? `http://localhost:${process.env.PORT ?? 3579}`;
const API_KEY = process.env.API_KEY ?? "";

async function apiCall<T = unknown>(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Auto-Chain (Phase 2 harness) ─────────────────────────────────────
// When a tool returns more than the configured threshold of tokens, we
// call /api/rtk/compress to fold the payload before handing it back to
// the agent. Skips `companion_compress` itself (no recursion) and any
// tool reporting `isError` (preserve raw error text for diagnosis).

interface AutoChainConfig {
  enabled: boolean;
  thresholdTokens: number;
}

let cachedAutoChain: AutoChainConfig | null = null;

async function getAutoChainConfig(): Promise<AutoChainConfig> {
  if (cachedAutoChain) return cachedAutoChain;
  try {
    const res = await apiCall<{ data: { enabled: boolean; thresholdTokens: number } }>(
      "/rtk/auto-compress-config",
    );
    cachedAutoChain = {
      enabled: res.data.enabled,
      thresholdTokens: res.data.thresholdTokens,
    };
  } catch {
    // Default ON with sensible threshold if API unreachable.
    cachedAutoChain = { enabled: true, thresholdTokens: 4000 };
  }
  return cachedAutoChain;
}

interface TextContent {
  type: "text";
  text: string;
}

/**
 * Loose handler return type. Tools-agent only emits text content, but
 * the MCP SDK accepts a wider union; we narrow to text for processing
 * and pass the rest through unchanged.
 */
interface ToolResult {
  content: TextContent[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [k: string]: unknown;
}

const AUTO_CHAIN_SKIP_TOOLS = new Set([
  "companion_compress",
  // companion_ask compresses internally — wrapping again would over-fold
  // an already-budgeted answer.
  "companion_ask",
]);

async function maybeCompressResult(toolName: string, result: ToolResult): Promise<ToolResult> {
  if (AUTO_CHAIN_SKIP_TOOLS.has(toolName)) return result;
  if (result.isError) return result;

  // Skip multi-part / non-text content — joining could lose structure.
  // Tools today emit a single text part; guard for future variants.
  if (result.content.length !== 1 || result.content[0]?.type !== "text") return result;

  const cfg = await getAutoChainConfig();
  if (!cfg.enabled) return result;

  const original = result.content[0].text;
  const tokens = Math.ceil(original.length / 4);
  if (tokens <= cfg.thresholdTokens) return result;

  try {
    const res = await apiCall<{
      data: {
        compressed: string;
        originalTokens: number;
        compressedTokens: number;
        ratio: number;
        strategiesApplied: string[];
      };
    }>("/rtk/compress", {
      method: "POST",
      body: { text: original, budget_tokens: cfg.thresholdTokens, tool_name: toolName },
    });

    // Don't emit a marker when no strategies fired — the pipeline returned
    // the input verbatim and pretending we "compressed" it is misleading.
    if (res.data.strategiesApplied.length === 0 || res.data.compressedTokens >= res.data.originalTokens) {
      return result;
    }

    const ratioPct = (res.data.ratio * 100).toFixed(0);
    const strategies = res.data.strategiesApplied.join(", ");
    const meta = `\n\n<!-- companion-rtk: compressed ${res.data.originalTokens}→${res.data.compressedTokens} tokens (${ratioPct}%) via ${strategies} -->`;
    return {
      content: [{ type: "text", text: res.data.compressed + meta }],
      _meta: {
        ...result._meta,
        compressed: true,
        original_tokens: res.data.originalTokens,
        compressed_tokens: res.data.compressedTokens,
      },
    };
  } catch (err) {
    // Compression failed — return raw payload (don't drop data) but
    // surface the failure to stderr so a future telemetry hook can pick
    // it up. Phase 4 metrics will replace this with a structured emit.
    process.stderr.write(
      `[companion-mcp-agent] auto-chain compress failed for ${toolName}: ${String(err)}\n`,
    );
    return result;
  }
}

/** Wrap a tool handler so its return value passes through auto-chain. */
function withAutoChain<A>(
  toolName: string,
  handler: (args: A) => Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    const result = await handler(args);
    return maybeCompressResult(toolName, result);
  };
}

// ── Metrics (Phase 4 harness) ────────────────────────────────────────
// Fire-and-forget POST to /api/analytics/harness/log after every tool
// call. Never blocks the caller; HTTP errors are silently dropped so a
// metrics outage can't degrade an agent session.

function emitMetric(
  ts: number,
  toolName: string,
  durationMs: number,
  args: unknown,
  result: ToolResult | undefined,
  outcome: "ok" | "error",
  errorCode: string | undefined,
): void {
  let inputTokens = 0;
  try {
    inputTokens = Math.ceil(JSON.stringify(args ?? "").length / 4);
  } catch {
    inputTokens = 0;
  }
  let outputTokens = 0;
  let compressed = false;
  if (result) {
    for (const part of result.content) {
      if (part.type === "text") outputTokens += Math.ceil(part.text.length / 4);
    }
    if (result._meta && result._meta.compressed === true) compressed = true;
  }
  const body = {
    ts,
    tool: toolName,
    durationMs,
    inputTokens,
    outputTokens,
    outcome,
    errorCode,
    compressed,
    projectSlug: process.env.PROJECT_SLUG,
  };
  void apiCall("/analytics/harness/log", { method: "POST", body }).catch(() => {
    /* metrics never block agent flow */
  });
}

/** Outer-most wrapper — records every tool call regardless of inner wrappers. */
function withMetrics<A>(
  toolName: string,
  handler: (args: A) => Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    const ts = Date.now();
    let result: ToolResult | undefined;
    let outcome: "ok" | "error" = "ok";
    let errorCode: string | undefined;
    try {
      result = await handler(args);
      if (result.isError) {
        outcome = "error";
        const text = result.content[0]?.text ?? "";
        errorCode = text.slice(0, 200);
      }
      return result;
    } catch (err) {
      outcome = "error";
      errorCode = String(err).slice(0, 200);
      throw err;
    } finally {
      emitMetric(ts, toolName, Date.now() - ts, args, result, outcome, errorCode);
    }
  };
}

export function registerAgentTools(server: McpServer): void {
  // ── Wiki: Search (enriched with code symbols) ────────────────────────
  server.tool(
    "companion_wiki_search",
    "Search the project wiki knowledge base. Returns matching articles with relevance scores and related code symbols. Use this to find documented patterns, decisions, and known issues before starting work.",
    {
      query: z
        .string()
        .describe("Search query (e.g., 'auth flow', 'deploy process', 'known bugs')"),
      domain: z.string().optional().describe("Wiki domain slug (defaults to project slug)"),
    },
    withMetrics("companion_wiki_search", withAutoChain("companion_wiki_search", async ({ query, domain }) => {
      try {
        const d = domain ?? process.env.PROJECT_SLUG ?? "default";
        const projectSlug = process.env.PROJECT_SLUG ?? "";
        // Use searchWithCodeGraph mode — enriches results with related code symbols
        const res = await apiCall<{ data: unknown }>(`/wiki/${encodeURIComponent(d)}/query`, {
          method: "POST",
          body: { query, mode: "search", projectSlug: projectSlug || undefined },
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Wiki search failed: ${String(err)}` }],
          isError: true,
        };
      }
    })),
  );

  // ── Wiki: Read Article ────────────────────────────────────────────────
  server.tool(
    "companion_wiki_read",
    "Read a specific wiki article by slug. Use after wiki_search to get full article content.",
    {
      slug: z.string().describe("Article slug from search results"),
      domain: z.string().optional().describe("Wiki domain slug (defaults to project slug)"),
    },
    withMetrics("companion_wiki_read", withAutoChain("companion_wiki_read", async ({ slug, domain }) => {
      try {
        const d = domain ?? process.env.PROJECT_SLUG ?? "default";
        const res = await apiCall<{ data: unknown }>(
          `/wiki/${encodeURIComponent(d)}/articles/${encodeURIComponent(slug)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Wiki read failed: ${String(err)}` }],
          isError: true,
        };
      }
    })),
  );

  // ── Wiki: Save Note ───────────────────────────────────────────────────
  server.tool(
    "companion_wiki_note",
    "Save a discovery, decision, or pattern to the wiki. Persists knowledge for future sessions. Keep notes concise (1-3 paragraphs).",
    {
      content: z.string().min(1).max(5000).describe("Note content in markdown"),
      title: z.string().max(100).optional().describe("Note title (auto-generated if omitted)"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      domain: z.string().optional().describe("Wiki domain slug (defaults to project slug)"),
    },
    withMetrics("companion_wiki_note", withAutoChain("companion_wiki_note", async ({ content, title, tags, domain }) => {
      try {
        const d = domain ?? process.env.PROJECT_SLUG ?? "default";
        const res = await apiCall<{ data: { slug: string } }>(
          `/wiki/${encodeURIComponent(d)}/note`,
          {
            method: "POST",
            body: { content, title, tags },
          },
        );
        return { content: [{ type: "text", text: `Saved: wiki/${d}/${res.data.slug}` }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Wiki note failed: ${String(err)}` }],
          isError: true,
        };
      }
    })),
  );

  // ── CodeGraph: Impact Analysis (enriched with wiki articles) ─────────
  server.tool(
    "companion_codegraph_impact",
    "Check what files depend on a file BEFORE editing it. Returns reverse dependencies with risk scores and related wiki articles describing the file's domain. Use this when you're about to modify a file with exports used elsewhere.",
    {
      file: z
        .string()
        .describe("File path relative to project root (e.g., 'src/services/auth.ts')"),
      project: z.string().optional().describe("Project slug (auto-detected if omitted)"),
    },
    withMetrics("companion_codegraph_impact", withAutoChain("companion_codegraph_impact", async ({ file, project }) => {
      try {
        const p = project ?? process.env.PROJECT_SLUG ?? "";

        // Fetch impact analysis
        const impactRes = await apiCall<{ data: unknown }>(
          `/codegraph/impact?project=${encodeURIComponent(p)}&file=${encodeURIComponent(file)}`,
        );

        // Fetch related wiki articles for cross-reference
        let wikiArticles: unknown = null;
        try {
          const domain = process.env.PROJECT_SLUG ?? "default";
          // Extract filename stem as search query (e.g., "auth" from "src/services/auth.ts")
          const stem =
            file
              .split("/")
              .pop()
              ?.replace(/\.\w+$/, "") ?? file;
          const wikiRes = await apiCall<{ data: unknown }>(
            `/wiki/${encodeURIComponent(domain)}/query`,
            {
              method: "POST",
              body: { query: stem, mode: "search" },
            },
          );
          wikiArticles = wikiRes.data;
        } catch {
          // Wiki not available — fine, return impact-only
        }

        const result = {
          impact: impactRes.data,
          ...(wikiArticles ? { relatedWikiArticles: wikiArticles } : {}),
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Impact analysis failed: ${String(err)}` }],
          isError: true,
        };
      }
    })),
  );

  // ── Explain: Unified wiki + codegraph context ────────────────────────
  server.tool(
    "companion_explain",
    "Get full context about a file in one call: what it does (wiki articles), what depends on it (reverse deps + risk scores), and what it depends on (impact radius). Use BEFORE making significant changes to understand a file's role in the codebase.",
    {
      file: z
        .string()
        .describe("File path relative to project root (e.g., 'src/services/auth.ts')"),
      project: z.string().optional().describe("Project slug (auto-detected if omitted)"),
    },
    withMetrics("companion_explain", withAutoChain("companion_explain", async ({ file, project }) => {
      try {
        const p = project ?? process.env.PROJECT_SLUG ?? "";
        const domain = process.env.PROJECT_SLUG ?? "default";
        const stem =
          file
            .split("/")
            .pop()
            ?.replace(/\.\w+$/, "") ?? file;

        // Fire wiki search + codegraph impact + reverse deps in parallel
        const [wikiRes, impactRes, reverseDepsRes] = await Promise.all([
          apiCall<{ data: unknown }>(`/wiki/${encodeURIComponent(domain)}/query`, {
            method: "POST",
            body: { query: stem, mode: "search", projectSlug: p || undefined },
          }).catch(() => null),
          apiCall<{ data: unknown }>(
            `/codegraph/impact?project=${encodeURIComponent(p)}&file=${encodeURIComponent(file)}`,
          ).catch(() => null),
          apiCall<{ data: unknown }>(
            `/codegraph/reverse-deps?project=${encodeURIComponent(p)}&file=${encodeURIComponent(file)}`,
          ).catch(() => null),
        ]);

        const result: Record<string, unknown> = { file };

        if (wikiRes?.data) {
          result.documentation = wikiRes.data;
        }
        if (reverseDepsRes?.data) {
          result.dependedOnBy = reverseDepsRes.data;
        }
        if (impactRes?.data) {
          result.impactRadius = impactRes.data;
        }

        if (!wikiRes && !impactRes && !reverseDepsRes) {
          return {
            content: [
              {
                type: "text",
                text: `No data available for "${file}". Wiki may not have articles and CodeGraph may not be indexed for this project.`,
              },
            ],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Explain failed: ${String(err)}` }],
          isError: true,
        };
      }
    })),
  );

  // ── companion_ask (Phase 3: meta-tool) ──────────────────────────────
  server.tool(
    "companion_ask",
    "Ask a question about this project — Companion fans out to the wiki + code graph in parallel, ranks the matches, and folds the answer to a token budget. Use this INSTEAD OF separate wiki_search/codegraph_impact when you want one synthesised answer with sources. Cite sources before acting on the result.",
    {
      question: z
        .string()
        .min(1)
        .max(1000)
        .describe("Natural-language question (e.g., 'how does session lifecycle work')"),
      scope: z
        .enum(["code", "docs", "both"])
        .optional()
        .describe("Limit search to one layer. Default 'both'."),
      max_tokens: z
        .number()
        .int()
        .min(200)
        .max(8000)
        .optional()
        .describe("Token budget for the answer body (default 2000)"),
    },
    withMetrics("companion_ask", async ({ question, scope, max_tokens }) => {
      try {
        const res = await apiCall<{
          data: {
            answer: string;
            sources: Array<{ type: string; id: string; title: string; reference?: string }>;
            durationMs: number;
            layers: { wiki: boolean; codegraph: boolean; compressed: boolean };
            partial: boolean;
          };
        }>("/companion-ask", {
          method: "POST",
          body: { question, scope, max_tokens, project_slug: process.env.PROJECT_SLUG },
        });

        const layerSummary = [
          res.data.layers.wiki ? "wiki" : null,
          res.data.layers.codegraph ? "codegraph" : null,
          res.data.layers.compressed ? "compressed" : null,
        ]
          .filter(Boolean)
          .join("+");
        const meta = `\n\n<!-- companion-ask: ${res.data.sources.length} sources, ${res.data.durationMs}ms, ${layerSummary || "no-layers"}${res.data.partial ? ", partial" : ""} -->`;

        return {
          content: [{ type: "text", text: res.data.answer + meta }],
        };
      } catch (err) {
        process.stderr.write(`[companion-mcp-agent] companion_ask failed: ${String(err)}\n`);
        return {
          content: [{ type: "text", text: "Ask failed (see server logs)" }],
          isError: true,
        };
      }
    }),
  );

  // ── companion_compress (Phase 2: agent-callable RTK) ────────────────
  server.tool(
    "companion_compress",
    "Compress a large text blob via Companion's Runtime Token Keeper. Useful when you want to fold a verbose tool output, log, or stack trace down to a token budget without losing the gist. Skip when the agent already has the data inline — use only on outputs that are about to be re-quoted into context.",
    {
      text: z.string().min(1).describe("The text to compress"),
      budget_tokens: z
        .number()
        .int()
        .min(100)
        .max(32_000)
        .optional()
        .describe("Target token budget (default 2000). Final output is hard-capped to this."),
      tool_name: z
        .string()
        .max(64)
        .optional()
        .describe("Source tool name (lets context-sensitive strategies pick smarter)"),
    },
    withMetrics("companion_compress", async ({ text, budget_tokens, tool_name }) => {
      try {
        const res = await apiCall<{
          data: {
            compressed: string;
            originalTokens: number;
            compressedTokens: number;
            ratio: number;
            strategiesApplied: string[];
          };
        }>("/rtk/compress", {
          method: "POST",
          body: { text, budget_tokens, tool_name },
        });
        const verbatim =
          res.data.strategiesApplied.length === 0 ||
          res.data.compressedTokens >= res.data.originalTokens;
        const ratioPct = (res.data.ratio * 100).toFixed(0);
        const strategies = verbatim ? "verbatim" : res.data.strategiesApplied.join(", ");
        const tail = verbatim
          ? `\n\n<!-- companion-rtk: ${res.data.originalTokens} tokens, no compression needed -->`
          : `\n\n<!-- companion-rtk: compressed ${res.data.originalTokens}→${res.data.compressedTokens} tokens (${ratioPct}%) via ${strategies} -->`;
        return {
          content: [{ type: "text", text: res.data.compressed + tail }],
        };
      } catch (err) {
        // Don't echo the underlying fetch error (URL + auth header may leak).
        process.stderr.write(
          `[companion-mcp-agent] companion_compress failed: ${String(err)}\n`,
        );
        return {
          content: [{ type: "text", text: "Compression failed (see server logs)" }],
          isError: true,
        };
      }
    }),
  );
}
