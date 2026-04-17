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
    async ({ query, domain }) => {
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
    },
  );

  // ── Wiki: Read Article ────────────────────────────────────────────────
  server.tool(
    "companion_wiki_read",
    "Read a specific wiki article by slug. Use after wiki_search to get full article content.",
    {
      slug: z.string().describe("Article slug from search results"),
      domain: z.string().optional().describe("Wiki domain slug (defaults to project slug)"),
    },
    async ({ slug, domain }) => {
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
    },
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
    async ({ content, title, tags, domain }) => {
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
    },
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
    async ({ file, project }) => {
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
    },
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
    async ({ file, project }) => {
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
    },
  );
}
