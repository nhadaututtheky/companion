/**
 * Wiki Knowledge Base REST routes.
 *
 * Endpoints:
 *   GET    /api/wiki                         — list domains
 *   POST   /api/wiki                         — create domain
 *   GET    /api/wiki/:domain                 — get domain index
 *   DELETE /api/wiki/:domain                 — delete domain
 *   GET    /api/wiki/:domain/articles        — list articles
 *   GET    /api/wiki/:domain/articles/:slug  — read article
 *   PUT    /api/wiki/:domain/articles/:slug  — update article
 *   DELETE /api/wiki/:domain/articles/:slug  — delete article
 *   POST   /api/wiki/:domain/compile         — trigger compilation
 *   POST   /api/wiki/:domain/query           — search/retrieve articles
 *   GET    /api/wiki/:domain/raw             — list raw files
 *   POST   /api/wiki/:domain/raw             — upload raw content
 *   DELETE /api/wiki/:domain/raw/:filename   — delete raw file
 *   GET    /api/wiki/:domain/core            — read core rules
 *   PUT    /api/wiki/:domain/core            — write core rules
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse } from "@companion/shared";
import {
  listDomains,
  createDomain,
  deleteDomain,
  readIndex,
  listArticles,
  readArticle,
  writeArticle,
  deleteArticle,
  readCore,
  writeCore,
  listRawFiles,
  writeRawFile,
  deleteRawFile,
  compileWiki,
  searchArticles,
  retrieve,
  lintDomain,
  type ArticleMeta,
  CHARS_PER_TOKEN,
  archiveQuery,
  flagStale,
  getFlaggedArticles,
  writeNote,
  getWikiConfig,
  setWikiConfig,
  readChangelog,
  readPreviousVersion,
} from "../wiki/index.js";
import type { WriteContext } from "../wiki/types.js";

export function createWikiRoutes(): Hono {
  const app = new Hono();

  // ─── Config ─────────────────────────────────────────────────────────

  /** Get wiki config */
  app.get("/config", (c) => {
    return c.json<ApiResponse>({ success: true, data: getWikiConfig() });
  });

  /** Update wiki config */
  app.put(
    "/config",
    zValidator(
      "json",
      z.object({
        rootPath: z.string().optional(),
        defaultDomain: z.string().nullable().optional(),
        secondaryDomains: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      }),
    ),
    (c) => {
      const updates = c.req.valid("json");
      const config = setWikiConfig(updates);
      return c.json<ApiResponse>({ success: true, data: config });
    },
  );

  // ─── Domain CRUD ────────────────────────────────────────────────────

  /** List all wiki domains */
  app.get("/", (c) => {
    const domains = listDomains();
    return c.json<ApiResponse>({ success: true, data: domains });
  });

  /** Create a new domain */
  app.post(
    "/",
    zValidator(
      "json",
      z.object({
        slug: z
          .string()
          .min(2)
          .max(50)
          .regex(/^[a-z0-9][a-z0-9-]*$/),
        name: z.string().min(1).max(100),
      }),
    ),
    (c) => {
      const { slug, name } = c.req.valid("json");
      try {
        const domain = createDomain(slug, name);
        return c.json<ApiResponse>({ success: true, data: domain }, 201);
      } catch (err) {
        return c.json<ApiResponse>({ success: false, error: String(err) }, 400);
      }
    },
  );

  /** Get domain index */
  app.get("/:domain", (c) => {
    const { domain } = c.req.param();
    const index = readIndex(domain);
    if (!index) {
      return c.json<ApiResponse>({ success: false, error: `Domain "${domain}" not found` }, 404);
    }
    return c.json<ApiResponse>({ success: true, data: index });
  });

  /** Delete domain */
  app.delete("/:domain", (c) => {
    const { domain } = c.req.param();
    try {
      deleteDomain(domain);
      return c.json<ApiResponse>({ success: true });
    } catch (err) {
      return c.json<ApiResponse>({ success: false, error: String(err) }, 404);
    }
  });

  // ─── Articles ───────────────────────────────────────────────────────

  /** List articles in a domain */
  app.get("/:domain/articles", (c) => {
    const { domain } = c.req.param();
    const articles = listArticles(domain);
    return c.json<ApiResponse>({ success: true, data: articles });
  });

  /** Read a single article */
  app.get("/:domain/articles/:slug", (c) => {
    const { domain, slug } = c.req.param();
    const article = readArticle(domain, slug);
    if (!article) {
      return c.json<ApiResponse>({ success: false, error: "Article not found" }, 404);
    }
    return c.json<ApiResponse>({ success: true, data: article });
  });

  /** Update an article */
  app.put(
    "/:domain/articles/:slug",
    zValidator(
      "json",
      z.object({
        title: z.string().optional(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        reason: z.string().max(200).optional(),
      }),
    ),
    (c) => {
      const { domain, slug } = c.req.param();
      const body = c.req.valid("json");

      const ctx: WriteContext = {
        sessionId: body.sessionId,
        model: body.model,
        reason: body.reason,
      };

      const existing = readArticle(domain, slug);
      const meta: ArticleMeta = existing
        ? {
            ...existing.meta,
            title: body.title ?? existing.meta.title,
            tags: body.tags ?? existing.meta.tags,
            tokens: Math.ceil(body.content.length / CHARS_PER_TOKEN),
            compiledAt: new Date().toISOString(),
            manuallyEdited: true,
          }
        : {
            title: body.title ?? slug,
            domain,
            compiledFrom: [],
            compiledBy: "manual",
            compiledAt: new Date().toISOString(),
            tokens: Math.ceil(body.content.length / CHARS_PER_TOKEN),
            tags: body.tags ?? [],
            manuallyEdited: true,
          };

      try {
        writeArticle(domain, slug, meta, body.content, undefined, ctx);
        return c.json<ApiResponse>({ success: true, data: { slug, ...meta } });
      } catch (err) {
        return c.json<ApiResponse>({ success: false, error: String(err) }, 400);
      }
    },
  );

  /** Delete an article */
  app.delete("/:domain/articles/:slug", (c) => {
    const { domain, slug } = c.req.param();
    try {
      deleteArticle(domain, slug);
      return c.json<ApiResponse>({ success: true });
    } catch (err) {
      return c.json<ApiResponse>({ success: false, error: String(err) }, 404);
    }
  });

  // ─── Core Rules ─────────────────────────────────────────────────────

  /** Read core rules */
  app.get("/:domain/core", (c) => {
    const { domain } = c.req.param();
    const core = readCore(domain);
    return c.json<ApiResponse>({ success: true, data: { content: core } });
  });

  /** Write core rules */
  app.put("/:domain/core", zValidator("json", z.object({ content: z.string() })), (c) => {
    const { domain } = c.req.param();
    const { content } = c.req.valid("json");
    try {
      writeCore(domain, content);
      return c.json<ApiResponse>({ success: true });
    } catch (err) {
      return c.json<ApiResponse>({ success: false, error: String(err) }, 400);
    }
  });

  // ─── Quick Notes ────────────────────────────────────────────────────

  /** Agent writes a quick note directly — no compile cycle needed */
  app.post(
    "/:domain/note",
    zValidator(
      "json",
      z.object({
        content: z.string().min(1).max(20000),
        title: z.string().max(100).optional(),
        tags: z.array(z.string()).optional(),
        confidence: z.enum(["extracted", "inferred", "ambiguous"]).optional(),
        sourceUrl: z.string().optional(),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        reason: z.string().max(200).optional(),
      }),
    ),
    (c) => {
      const { domain } = c.req.param();
      const body = c.req.valid("json");
      const ctx: WriteContext = {
        sessionId: body.sessionId,
        model: body.model,
        reason: body.reason,
      };
      const ref = writeNote(
        domain,
        body.content,
        {
          title: body.title,
          tags: body.tags,
          confidence: body.confidence,
          sourceUrl: body.sourceUrl,
        },
        undefined,
        ctx,
      );
      return c.json<ApiResponse>({ success: true, data: ref }, 201);
    },
  );

  // ─── Compilation ────────────────────────────────────────────────────

  /** Trigger compilation */
  app.post(
    "/:domain/compile",
    zValidator(
      "json",
      z
        .object({
          rawFiles: z.array(z.string()).optional(),
          overwrite: z.boolean().optional(),
          sessionId: z.string().optional(),
          model: z.string().optional(),
          reason: z.string().max(200).optional(),
        })
        .optional(),
    ),
    async (c) => {
      const { domain } = c.req.param();
      const body = c.req.valid("json") ?? {};

      const ctx: WriteContext = {
        sessionId: body.sessionId,
        model: body.model,
        reason: body.reason,
      };

      try {
        const result = await compileWiki(
          {
            domain,
            rawFiles: body.rawFiles,
            overwrite: body.overwrite,
          },
          undefined,
          ctx,
        );
        return c.json<ApiResponse>({ success: true, data: result });
      } catch (err) {
        return c.json<ApiResponse>({ success: false, error: String(err) }, 500);
      }
    },
  );

  // ─── Query / Search ─────────────────────────────────────────────────

  /** Search or retrieve relevant articles */
  app.post(
    "/:domain/query",
    zValidator(
      "json",
      z.object({
        query: z.string().min(1),
        tokenBudget: z.number().int().positive().optional(),
        includeCore: z.boolean().optional(),
        mode: z.enum(["search", "retrieve"]).optional(),
      }),
    ),
    (c) => {
      const { domain } = c.req.param();
      const body = c.req.valid("json");

      if (body.mode === "search") {
        const results = searchArticles(domain, body.query);
        return c.json<ApiResponse>({ success: true, data: results });
      }

      // Default: retrieve (budget-aware)
      const result = retrieve({
        domain,
        query: body.query,
        tokenBudget: body.tokenBudget,
        includeCore: body.includeCore,
      });

      // Self-archive: save Q&A as raw material for future compile cycles
      archiveQuery(domain, body.query, result);

      return c.json<ApiResponse>({ success: true, data: result });
    },
  );

  // ─── Stale Flags ────────────────────────────────────────────────────

  /** Flag an article as stale (needs recompilation) */
  app.post(
    "/:domain/flag-stale/:slug",
    zValidator("json", z.object({ reason: z.string().optional() }).optional()),
    (c) => {
      const { domain, slug } = c.req.param();
      const body = c.req.valid("json");
      flagStale(domain, slug, body?.reason);
      return c.json<ApiResponse>({ success: true, data: { flagged: slug } });
    },
  );

  /** List flagged articles for a domain */
  app.get("/:domain/flags", (c) => {
    const { domain } = c.req.param();
    const flags = getFlaggedArticles(domain);
    return c.json<ApiResponse>({ success: true, data: flags });
  });

  // ─── Changelog + Previous Versions ─────────────────────────────

  /** Read changelog for a domain (most recent first) */
  app.get("/:domain/changelog", (c) => {
    const { domain } = c.req.param();
    const slug = c.req.query("slug");
    const limitStr = c.req.query("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    const entries = readChangelog(domain, { slug, limit });
    return c.json<ApiResponse>({ success: true, data: entries });
  });

  /** Read previous version of an article */
  app.get("/:domain/articles/:slug/prev", (c) => {
    const { domain, slug } = c.req.param();
    const prev = readPreviousVersion(domain, slug);
    if (prev === null) {
      return c.json<ApiResponse>({ success: false, error: "No previous version" }, 404);
    }
    return c.json<ApiResponse>({ success: true, data: { content: prev } });
  });

  // ─── Lint ───────────────────────────────────────────────────────────

  /** Run freshness lint on a domain */
  app.get("/:domain/lint", (c) => {
    const { domain } = c.req.param();
    try {
      const result = lintDomain(domain);
      return c.json<ApiResponse>({ success: true, data: result });
    } catch (err) {
      return c.json<ApiResponse>({ success: false, error: String(err) }, 400);
    }
  });

  // ─── Raw Material ──────────────────────────────────────────────────

  /** List raw files */
  app.get("/:domain/raw", (c) => {
    const { domain } = c.req.param();
    const files = listRawFiles(domain);
    return c.json<ApiResponse>({ success: true, data: files });
  });

  /** Upload raw content */
  app.post(
    "/:domain/raw",
    zValidator(
      "json",
      z.object({
        filename: z.string().min(1).max(200),
        content: z.string().min(1),
      }),
    ),
    (c) => {
      const { domain } = c.req.param();
      const { filename, content } = c.req.valid("json");
      try {
        writeRawFile(domain, filename, content);
        return c.json<ApiResponse>({ success: true }, 201);
      } catch (err) {
        return c.json<ApiResponse>({ success: false, error: String(err) }, 400);
      }
    },
  );

  /** Delete raw file */
  app.delete("/:domain/raw/:filename", (c) => {
    const { domain, filename } = c.req.param();
    try {
      deleteRawFile(domain, filename);
      return c.json<ApiResponse>({ success: true });
    } catch (err) {
      return c.json<ApiResponse>({ success: false, error: String(err) }, 404);
    }
  });

  return app;
}
