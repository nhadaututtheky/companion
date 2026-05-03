/**
 * REST entry point for the `companion_ask` orchestrator.
 *
 * The MCP tool of the same name proxies through this endpoint so that
 * authn / rate-limit / observability stay co-located with every other
 * Companion API. Direct callers (web debug panel, integration tests)
 * use this exactly the same way.
 */

import { Hono } from "hono";
import { companionAsk, NoSourcesError, type AskScope } from "../services/companion-ask.js";
import type { ApiResponse } from "@companion/shared";

const MAX_QUESTION_CHARS = 1000;
const MIN_TOKENS = 200;
const MAX_TOKENS = 8_000;

export const companionAskRoutes = new Hono();

/**
 * POST /api/companion-ask
 * Body: { question: string, scope?: "code"|"docs"|"both",
 *         max_tokens?: number, project_slug?: string,
 *         wiki_domain?: string, cwd?: string }
 */
companionAskRoutes.post("/", async (c) => {
  let body: {
    question?: unknown;
    scope?: unknown;
    max_tokens?: unknown;
    project_slug?: unknown;
    wiki_domain?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" } satisfies ApiResponse, 400);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length === 0) {
    return c.json(
      { success: false, error: "`question` field is required" } satisfies ApiResponse,
      400,
    );
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return c.json(
      {
        success: false,
        error: `question must be ≤${MAX_QUESTION_CHARS} chars`,
      } satisfies ApiResponse,
      400,
    );
  }

  let scope: AskScope = "both";
  if (body.scope === "code" || body.scope === "docs" || body.scope === "both") {
    scope = body.scope;
  } else if (body.scope !== undefined) {
    return c.json(
      { success: false, error: "scope must be 'code', 'docs', or 'both'" } satisfies ApiResponse,
      400,
    );
  }

  let maxTokens: number | undefined;
  if (body.max_tokens !== undefined) {
    if (typeof body.max_tokens !== "number" || !Number.isFinite(body.max_tokens)) {
      return c.json(
        { success: false, error: "max_tokens must be a finite number" } satisfies ApiResponse,
        400,
      );
    }
    if (body.max_tokens < MIN_TOKENS || body.max_tokens > MAX_TOKENS) {
      return c.json(
        {
          success: false,
          error: `max_tokens must be ${MIN_TOKENS}..${MAX_TOKENS}`,
        } satisfies ApiResponse,
        400,
      );
    }
    maxTokens = Math.floor(body.max_tokens);
  }

  // Slug shape guard — prevents `' OR 1=1` style noise reaching graph queries
  // even though Drizzle parameterises. Tight charset keeps audit logs clean.
  const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/i;

  let projectSlug: string | undefined;
  if (body.project_slug !== undefined) {
    if (typeof body.project_slug !== "string" || !SAFE_SLUG.test(body.project_slug)) {
      return c.json(
        { success: false, error: "project_slug has invalid shape" } satisfies ApiResponse,
        400,
      );
    }
    projectSlug = body.project_slug;
  }

  let wikiDomain: string | undefined;
  if (body.wiki_domain !== undefined) {
    if (typeof body.wiki_domain !== "string" || !SAFE_SLUG.test(body.wiki_domain)) {
      return c.json(
        { success: false, error: "wiki_domain has invalid shape" } satisfies ApiResponse,
        400,
      );
    }
    wikiDomain = body.wiki_domain;
  }

  try {
    const result = await companionAsk({
      question,
      scope,
      maxTokens,
      projectSlug,
      wikiDomain,
    });
    return c.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    if (err instanceof NoSourcesError) {
      return c.json(
        { success: false, error: err.message, code: err.code } as ApiResponse & { code: string },
        404,
      );
    }
    return c.json(
      { success: false, error: `Ask failed: ${String(err)}` } satisfies ApiResponse,
      500,
    );
  }
});
