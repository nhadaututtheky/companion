/**
 * MCP Tool definitions + handlers for Companion.
 * Each tool calls the Companion HTTP API (localhost) to keep MCP server stateless.
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

// ── Tool Registration ─────────────────────────────────────────────────────────

export function registerTools(server: McpServer): void {
  // ── companion_list_sessions ──────────────────────────────────────────────
  server.tool(
    "companion_list_sessions",
    "List all active Companion sessions with status, model, and cost",
    {},
    async () => {
      const res = await apiCall<{ data: { sessions: unknown[] } }>("/sessions");
      return {
        content: [{ type: "text", text: JSON.stringify(res.data.sessions, null, 2) }],
      };
    },
  );

  // ── companion_spawn_session ──────────────────────────────────────────────
  server.tool(
    "companion_spawn_session",
    "Spawn a new Claude Code session in Companion. Returns the session ID.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      projectSlug: z
        .string()
        .optional()
        .describe("Project slug (optional, auto-detected from dir)"),
      model: z.string().optional().describe("Model to use (default: claude-sonnet-4-6)"),
      permissionMode: z
        .enum(["default", "acceptEdits", "bypassPermissions", "plan"])
        .optional()
        .describe("Permission mode"),
      prompt: z.string().optional().describe("Initial prompt to send after session starts"),
    },
    async ({ projectDir, projectSlug, model, permissionMode, prompt }) => {
      const res = await apiCall<{ data: { sessionId: string } }>("/sessions", {
        method: "POST",
        body: {
          projectDir,
          projectSlug,
          model,
          permissionMode,
          prompt,
        },
      });
      return {
        content: [{ type: "text", text: `Session created: ${res.data.sessionId}` }],
      };
    },
  );

  // ── companion_send_message ───────────────────────────────────────────────
  server.tool(
    "companion_send_message",
    "Send a message to an active Companion session",
    {
      sessionId: z.string().describe("Target session ID"),
      content: z.string().describe("Message content to send"),
    },
    async ({ sessionId, content }) => {
      await apiCall(`/sessions/${sessionId}/messages`, {
        method: "POST",
        body: { content },
      });
      return {
        content: [{ type: "text", text: `Message sent to session ${sessionId}` }],
      };
    },
  );

  // ── companion_get_session ────────────────────────────────────────────────
  server.tool(
    "companion_get_session",
    "Get detailed state of a Companion session including recent messages, cost, and status",
    {
      sessionId: z.string().describe("Session ID to inspect"),
    },
    async ({ sessionId }) => {
      const res = await apiCall<{ data: unknown }>(`/sessions/${sessionId}`);
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    },
  );

  // ── companion_get_project_context ────────────────────────────────────────
  server.tool(
    "companion_get_project_context",
    "Get project info, recent sessions, and active channels for a project",
    {
      projectSlug: z.string().describe("Project slug"),
    },
    async ({ projectSlug }) => {
      const [project, sessions, channelsRes] = await Promise.all([
        apiCall<{ data: unknown }>(`/projects/${projectSlug}`).catch(() => ({ data: null })),
        apiCall<{ data: { sessions: unknown[] } }>("/sessions"),
        apiCall<{ data: { items: unknown[] } }>(`/channels?projectSlug=${projectSlug}`).catch(
          () => ({ data: { items: [] } }),
        ),
      ]);

      const projectSessions = Array.isArray(sessions.data.sessions)
        ? sessions.data.sessions.filter(
            (s) => (s as Record<string, unknown>).projectSlug === projectSlug,
          )
        : [];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                project: project.data,
                activeSessions: projectSessions,
                channels: channelsRes.data.items,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── companion_create_channel ─────────────────────────────────────────────
  server.tool(
    "companion_create_channel",
    "Create a shared context channel for multi-agent collaboration (debate, review, brainstorm)",
    {
      topic: z.string().describe("Channel topic or question"),
      type: z
        .enum(["debate", "review", "red_team", "brainstorm"])
        .default("debate")
        .describe("Channel type"),
      projectSlug: z.string().optional().describe("Project to associate with"),
      maxRounds: z.number().optional().describe("Max rounds before auto-conclude (default: 5)"),
    },
    async ({ topic, type, projectSlug, maxRounds }) => {
      const res = await apiCall<{ data: { id: string } }>("/channels", {
        method: "POST",
        body: { topic, type, projectSlug, maxRounds },
      });
      return {
        content: [
          { type: "text", text: `Channel created: ${res.data.id}\nTopic: ${topic}\nType: ${type}` },
        ],
      };
    },
  );

  // ── companion_send_to_channel ────────────────────────────────────────────
  server.tool(
    "companion_send_to_channel",
    "Post a message to a shared channel with an agent role",
    {
      channelId: z.string().describe("Channel ID"),
      agentId: z.string().describe("Agent/session ID posting the message"),
      role: z.enum(["advocate", "challenger", "judge", "reviewer", "human"]).describe("Agent role"),
      content: z.string().describe("Message content"),
      round: z.number().optional().describe("Debate round number"),
    },
    async ({ channelId, agentId, role, content, round }) => {
      await apiCall<{ data: unknown }>(`/channels/${channelId}/messages`, {
        method: "POST",
        body: { agentId, role, content, round },
      });
      return {
        content: [{ type: "text", text: `Message posted to channel ${channelId} as ${role}` }],
      };
    },
  );

  // ── companion_get_session_summary ─────────────────────────────────────────
  server.tool(
    "companion_get_session_summary",
    "Get auto-generated summary for a session, or latest summaries for a project",
    {
      sessionId: z.string().optional().describe("Specific session ID to get summary for"),
      projectSlug: z
        .string()
        .optional()
        .describe("Project slug to get latest summaries (returns up to 3)"),
    },
    async ({ sessionId, projectSlug }) => {
      if (sessionId) {
        const res = await apiCall<{ data: unknown }>(`/sessions/${sessionId}/summary`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      if (projectSlug) {
        const res = await apiCall<{ data: unknown }>(`/projects/${projectSlug}/summaries`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      }
      return { content: [{ type: "text", text: "Provide either sessionId or projectSlug" }] };
    },
  );

  // ── companion_start_debate ────────────────────────────────────────────
  server.tool(
    "companion_start_debate",
    "Start a multi-agent debate on a topic. Returns channel ID to track the debate.",
    {
      topic: z.string().describe("Debate topic or question"),
      format: z
        .enum(["pro_con", "red_team", "review", "brainstorm"])
        .default("pro_con")
        .describe("Debate format"),
      projectSlug: z.string().optional().describe("Project to associate with"),
      maxRounds: z.number().optional().describe("Max rounds (default: 5)"),
    },
    async ({ topic, format, projectSlug, maxRounds }) => {
      const res = await apiCall<{ data: unknown }>("/channels/debate", {
        method: "POST",
        body: { topic, format, projectSlug, maxRounds },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    },
  );

  // ── companion_conclude_debate ────────────────────────────────────────
  server.tool(
    "companion_conclude_debate",
    "Force-conclude an active debate and generate verdict",
    {
      channelId: z.string().describe("Debate channel ID"),
    },
    async ({ channelId }) => {
      const res = await apiCall<{ data: unknown }>(`/channels/${channelId}/conclude`, {
        method: "POST",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    },
  );

  // ── companion_read_channel ───────────────────────────────────────────────
  server.tool(
    "companion_read_channel",
    "Read messages from a shared channel with pagination",
    {
      channelId: z.string().describe("Channel ID to read"),
      limit: z.number().optional().describe("Max messages to return (default: 50)"),
    },
    async ({ channelId, limit }) => {
      const res = await apiCall<{ data: unknown }>(
        `/channels/${channelId}${limit ? `?limit=${limit}` : ""}`,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    },
  );

  // ── companion_web_scrape ────────────────────────────────────────────────
  server.tool(
    "companion_web_scrape",
    "Scrape a URL via Companion's webclaw integration. Returns clean, token-optimized content for LLM consumption.",
    {
      url: z.string().describe("URL to scrape (must be public http/https)"),
      maxTokens: z
        .number()
        .optional()
        .describe("Max tokens in response (default: 4000, max: 16000)"),
      formats: z
        .array(z.enum(["markdown", "llm", "text", "json"]))
        .optional()
        .describe("Output formats (default: ['llm'])"),
      skipCache: z.boolean().optional().describe("Skip cache and fetch fresh (default: false)"),
    },
    async ({ url, maxTokens, formats, skipCache }) => {
      try {
        if (maxTokens && !formats) {
          // Use scrapeForContext for token-budgeted output
          const res = await apiCall<{ data: { content: string } }>("/webintel/docs", {
            method: "POST",
            body: { url, maxTokens: Math.min(maxTokens ?? 4000, 16_000), refresh: skipCache },
          });
          return { content: [{ type: "text", text: res.data.content }] };
        }

        const res = await apiCall<{ data: unknown }>("/webintel/scrape", {
          method: "POST",
          body: { url, formats: formats ?? ["llm"], skipCache },
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Scrape failed: ${String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ── companion_web_research ──────────────────────────────────────────────
  server.tool(
    "companion_web_research",
    "Research a topic by searching the web, scraping top results, and returning synthesized content with source citations.",
    {
      query: z.string().describe("Research query (e.g., 'Hono middleware patterns')"),
      maxTokens: z
        .number()
        .optional()
        .describe("Max tokens in response (default: 3000, max: 8000)"),
    },
    async ({ query, maxTokens }) => {
      try {
        const res = await apiCall<{
          data: { content: string; sources: { title: string; url: string }[] };
        }>("/webintel/research", {
          method: "POST",
          body: { query, maxTokens: Math.min(maxTokens ?? 3000, 8000) },
        });

        const sourcesText = res.data.sources
          .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`)
          .join("\n");

        return {
          content: [{ type: "text", text: `${res.data.content}\n\n---\nSources:\n${sourcesText}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Research failed: ${String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ── companion_web_crawl ─────────────────────────────────────────────────
  server.tool(
    "companion_web_crawl",
    "Start an async crawl job on a website. Returns a job ID to poll for results.",
    {
      url: z.string().describe("Starting URL to crawl (must be public http/https)"),
      maxDepth: z.number().optional().describe("Max link depth to follow (default: 2)"),
      maxPages: z.number().optional().describe("Max pages to crawl (default: 50, max: 200)"),
    },
    async ({ url, maxDepth, maxPages }) => {
      try {
        const res = await apiCall<{ data: { jobId: string } }>("/webintel/crawl", {
          method: "POST",
          body: { url, maxDepth, maxPages },
        });
        return {
          content: [
            {
              type: "text",
              text: `Crawl started. Job ID: ${res.data.jobId}\nUse companion_web_crawl_status to check progress.`,
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Crawl failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_web_crawl_status ──────────────────────────────────────────
  server.tool(
    "companion_web_crawl_status",
    "Check the status of an active crawl job",
    {
      jobId: z.string().describe("Crawl job ID returned by companion_web_crawl"),
    },
    async ({ jobId }) => {
      try {
        const res = await apiCall<{ data: unknown }>(`/webintel/jobs/${encodeURIComponent(jobId)}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Job status check failed: ${String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ── companion_web_status ────────────────────────────────────────────────
  server.tool(
    "companion_web_status",
    "Check webclaw sidecar health and cache statistics",
    {},
    async () => {
      try {
        const res = await apiCall<{ data: { available: boolean; cache: unknown } }>(
          "/webintel/status",
        );
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Status check failed: ${String(err)}` }],
          isError: true,
        };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Wiki Knowledge Base Tools
  // ═══════════════════════════════════════════════════════════════════════════

  // ── companion_wiki_list ─────────────────────────────────────────────────
  server.tool(
    "companion_wiki_list",
    "List all wiki domains and their article counts",
    {},
    async () => {
      try {
        const res = await apiCall<{ data: unknown }>("/wiki");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Wiki list failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_wiki_read_core ────────────────────────────────────────────
  server.tool(
    "companion_wiki_read_core",
    "Read the core rules (L0 context) for a wiki domain. These are the high-priority rules always injected into sessions.",
    {
      domain: z.string().describe("Wiki domain slug (e.g., 'companion', 'trading')"),
    },
    async ({ domain }) => {
      try {
        const res = await apiCall<{ data: { content: string } }>(`/wiki/${encodeURIComponent(domain)}/core`);
        return { content: [{ type: "text", text: res.data.content || "(empty core rules)" }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Wiki core read failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_wiki_read ─────────────────────────────────────────────────
  server.tool(
    "companion_wiki_read",
    "Read a specific wiki article by domain and slug",
    {
      domain: z.string().describe("Wiki domain slug"),
      slug: z.string().describe("Article slug (e.g., 'auth-flow', 'deploy-checklist')"),
    },
    async ({ domain, slug }) => {
      try {
        const res = await apiCall<{ data: unknown }>(
          `/wiki/${encodeURIComponent(domain)}/articles/${encodeURIComponent(slug)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Wiki read failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_wiki_search ───────────────────────────────────────────────
  server.tool(
    "companion_wiki_search",
    "Search wiki articles by keyword query. Returns matching articles with relevance scores.",
    {
      domain: z.string().describe("Wiki domain slug to search in"),
      query: z.string().describe("Search query (e.g., 'authentication', 'deploy process')"),
    },
    async ({ domain, query }) => {
      try {
        const res = await apiCall<{ data: unknown }>(`/wiki/${encodeURIComponent(domain)}/query`, {
          method: "POST",
          body: { query, mode: "search" },
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Wiki search failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_wiki_note ─────────────────────────────────────────────────
  server.tool(
    "companion_wiki_note",
    "Write a quick note to the wiki knowledge base. Use this to persist discoveries, patterns, decisions, or instructions that should be available to future sessions.",
    {
      domain: z.string().describe("Wiki domain slug to write to"),
      content: z.string().min(1).max(20000).describe("Note content (markdown supported, max 20k chars)"),
      title: z.string().max(100).optional().describe("Note title (auto-generated from content if omitted)"),
      tags: z.array(z.string()).optional().describe("Tags for categorization (e.g., ['auth', 'security'])"),
      confidence: z
        .enum(["extracted", "inferred", "ambiguous"])
        .optional()
        .describe("Confidence level: extracted (from source), inferred (deduced), ambiguous (uncertain)"),
    },
    async ({ domain, content, title, tags, confidence }) => {
      try {
        const res = await apiCall<{ data: { slug: string } }>(`/wiki/${encodeURIComponent(domain)}/note`, {
          method: "POST",
          body: { content, title, tags, confidence },
        });
        return {
          content: [{ type: "text", text: `Note saved to wiki/${domain}/${res.data.slug}` }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Wiki note failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_wiki_list_articles ────────────────────────────────────────
  server.tool(
    "companion_wiki_list_articles",
    "List all articles in a wiki domain with titles, tags, and last-modified dates",
    {
      domain: z.string().describe("Wiki domain slug"),
    },
    async ({ domain }) => {
      try {
        const res = await apiCall<{ data: unknown }>(`/wiki/${encodeURIComponent(domain)}/articles`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Wiki articles list failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CodeGraph (AI Context) Tools
  // ═══════════════════════════════════════════════════════════════════════════

  // ── companion_codegraph_scan ────────────────────────────────────────────
  server.tool(
    "companion_codegraph_scan",
    "Trigger a codebase scan for a project. Scans files, extracts symbols (functions, classes, types, endpoints), and builds a dependency graph. Use this when starting work on an unfamiliar project.",
    {
      projectSlug: z.string().describe("Project slug to scan"),
    },
    async ({ projectSlug }) => {
      try {
        const res = await apiCall<{ data: unknown }>("/codegraph/scan", {
          method: "POST",
          body: { project: projectSlug },
        });
        return {
          content: [{ type: "text", text: `Scan started for ${projectSlug}. Use companion_codegraph_status to check progress.\n${JSON.stringify(res.data, null, 2)}` }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Scan failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_codegraph_status ──────────────────────────────────────────
  server.tool(
    "companion_codegraph_status",
    "Check the status of a codebase scan (scanning, describing, ready, or idle)",
    {
      projectSlug: z.string().describe("Project slug"),
    },
    async ({ projectSlug }) => {
      try {
        const res = await apiCall<{ data: unknown }>(`/codegraph/status?project=${encodeURIComponent(projectSlug)}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Status check failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_codegraph_search ──────────────────────────────────────────
  server.tool(
    "companion_codegraph_search",
    "Search the code graph for symbols (functions, classes, types, hooks, endpoints) by keyword. Returns matching nodes with file paths, descriptions, and relationships.",
    {
      projectSlug: z.string().describe("Project slug"),
      query: z.string().describe("Search query (e.g., 'auth middleware', 'useSession', 'POST /api')"),
    },
    async ({ projectSlug, query }) => {
      try {
        const res = await apiCall<{ data: unknown }>(
          `/codegraph/search?project=${encodeURIComponent(projectSlug)}&q=${encodeURIComponent(query)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Search failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_codegraph_stats ───────────────────────────────────────────
  server.tool(
    "companion_codegraph_stats",
    "Get code graph statistics: total symbols, edges, files scanned, community clusters (Leiden algorithm), and last scan time",
    {
      projectSlug: z.string().describe("Project slug"),
    },
    async ({ projectSlug }) => {
      try {
        const res = await apiCall<{ data: unknown }>(`/codegraph/stats?project=${encodeURIComponent(projectSlug)}`);
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Stats failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_codegraph_impact ──────────────────────────────────────────
  server.tool(
    "companion_codegraph_impact",
    "Analyze blast radius of changing a file. Returns all files that depend on (or are depended by) the target file, with risk scores.",
    {
      projectSlug: z.string().describe("Project slug"),
      file: z.string().describe("File path relative to project root (e.g., 'src/services/auth.ts')"),
    },
    async ({ projectSlug, file }) => {
      try {
        const res = await apiCall<{ data: unknown }>(
          `/codegraph/impact?project=${encodeURIComponent(projectSlug)}&file=${encodeURIComponent(file)}`,
        );
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Impact analysis failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_codegraph_diff_impact ────────────────────────────────────
  server.tool(
    "companion_codegraph_diff_impact",
    "Pre-commit impact analysis: what's the blast radius of your changes? Analyzes git diff (or explicit file list) to find affected files, risk scores, impacted communities, and review suggestions.",
    {
      projectSlug: z.string().describe("Project slug"),
      files: z.array(z.string()).optional().describe("Explicit file paths to analyze (overrides git diff)"),
      projectDir: z.string().optional().describe("Project directory for git diff (defaults to auto-detect)"),
      since: z.string().optional().describe("Git diff reference (default: HEAD~1)"),
    },
    async ({ projectSlug, files, projectDir, since }) => {
      try {
        const res = await apiCall<{ data: unknown }>("/codegraph/impact-analysis", {
          method: "POST",
          body: { project: projectSlug, files, projectDir, since },
        });
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Diff impact analysis failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_generate_skills ─────────────────────────────────────────
  server.tool(
    "companion_generate_skills",
    "Generate project-specific Claude Code skills from the code graph. Creates .claude/skills/ files with exploring guides, debugging tips, impact check workflows, and wiki integration. Auto-updates on each call.",
    {
      projectSlug: z.string().describe("Project slug to generate skills for"),
    },
    async ({ projectSlug }) => {
      try {
        const res = await apiCall<{ data: { generated: string[]; skipped: string[]; dir: string } }>("/codegraph/generate-skills", {
          method: "POST",
          body: { projectSlug },
        });
        const d = res.data;
        const summary = d.generated.length > 0
          ? `Generated ${d.generated.length} skills:\n${d.generated.map((f) => `  - ${f}`).join("\n")}\n\nWritten to: ${d.dir}`
          : `No skills generated. ${d.skipped.join(", ")}`;
        return { content: [{ type: "text", text: summary }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Skills generation failed: ${String(err)}` }], isError: true };
      }
    },
  );

  // ── companion_codegraph_diagram ───────────────────────────────────────
  server.tool(
    "companion_codegraph_diagram",
    "Generate Mermaid architecture diagrams from the code graph. Types: 'architecture' (community overview), 'module' (file dependency tree), 'flow' (call chain from a symbol).",
    {
      projectSlug: z.string().describe("Project slug"),
      type: z.enum(["architecture", "module", "flow"]).describe("Diagram type"),
      file: z.string().optional().describe("File path (required for 'module' type)"),
      symbol: z.string().optional().describe("Symbol name (required for 'flow' type)"),
    },
    async ({ projectSlug, type, file, symbol }) => {
      try {
        const params = new URLSearchParams({ project: projectSlug, type });
        if (file) params.set("file", file);
        if (symbol) params.set("symbol", symbol);

        const res = await apiCall<{ data: { mermaid: string; description: string; nodeCount: number; edgeCount: number } }>(
          `/codegraph/diagram?${params.toString()}`,
        );
        const d = res.data;
        const output = `${d.description}\n\n\`\`\`mermaid\n${d.mermaid}\n\`\`\`\n\nNodes: ${d.nodeCount} | Edges: ${d.edgeCount}`;
        return { content: [{ type: "text", text: output }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Diagram generation failed: ${String(err)}` }], isError: true };
      }
    },
  );
}
