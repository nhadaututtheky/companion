/**
 * Session REST routes — create, list, get, send messages, kill sessions.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { resolve as pathResolve, normalize } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { WsBridge } from "../services/ws-bridge.js";
import type { BotRegistry } from "../telegram/bot-registry.js";
import { eq as eqOp, desc as descOp, and as andOp } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessionSnapshots } from "../db/schema.js";
import {
  getSessionRecord,
  listSessions,
  getSessionMessages,
  countActiveSessions,
  endSessionRecord,
  listResumableSessions,
  dismissResumableSession,
  renameSession,
  updateSessionConfig,
  updateSessionTags,
} from "../services/session-store.js";
import { getProject, upsertProject } from "../services/project-profiles.js";
import { getTemplate, resolveTemplateVariables } from "../services/templates.js";
import { createLogger } from "../logger.js";
import { getMaxSessions } from "../services/license.js";
import { getSessionSummary } from "../services/session-summarizer.js";
import type { ApiResponse } from "@companion/shared";
import { thinkingModeTobudget } from "@companion/shared";

const log = createLogger("routes:sessions");

// Allowlist of valid Claude model identifiers — prevents CLI argument injection
const ALLOWED_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-sonnet-4-5-20250514",
  "claude-haiku-4-5-20251001",
] as const;

const createSessionSchema = z.object({
  projectSlug: z.string().optional(),
  projectDir: z.string().min(1).max(500),
  model: z.enum(ALLOWED_MODELS).optional(),
  permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions", "plan"]).optional(),
  prompt: z.string().max(10000).optional(),
  templateId: z.string().optional(),
  templateVars: z.record(z.string()).optional(),
  resume: z.boolean().optional(),
  cliSessionId: z.string().uuid().optional(),
  source: z.string().optional(),
  idleTimeoutMs: z.number().int().min(0).max(86_400_000).optional(),
  keepAlive: z.boolean().optional(),
  bare: z.boolean().optional(),
  thinkingMode: z.enum(["adaptive", "off", "deep"]).optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  source: z.string().optional(),
});

const permissionResponseSchema = z.object({
  behavior: z.enum(["allow", "deny"]),
});

const sessionSettingsSchema = z.object({
  idleTimeoutMs: z.number().int().min(0).optional(),
  keepAlive: z.boolean().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function sessionRoutes(bridge: WsBridge, botRegistry?: BotRegistry) {
  const app = new Hono();

  app.get("/", (c) => {
    const projectSlug = c.req.query("project");
    const status = c.req.query("status");
    const { limit, offset } = paginationSchema.parse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });

    const { items, total } = listSessions({ projectSlug, status, limit, offset });

    // Health-check: auto-fix sessions that appear active in DB but have no in-memory session
    const activeStatuses = new Set([
      "starting",
      "running",
      "waiting",
      "idle",
      "busy",
      "compacting",
    ]);
    let selfHealedCount = 0;
    for (const item of items) {
      if (activeStatuses.has(item.status) && !bridge.getSession(item.id)) {
        endSessionRecord(item.id);
        item.status = "ended";
        selfHealedCount++;
      }
    }
    if (selfHealedCount > 0) {
      log.info("Self-healed zombie sessions on list", { count: selfHealedCount });
    }

    return c.json({
      success: true,
      data: { sessions: items },
      meta: { total, page: Math.floor(offset / limit) + 1, limit },
    } satisfies ApiResponse);
  });

  // Cleanup zombie sessions (active in DB but no active in-memory session)
  app.post("/cleanup", (c) => {
    const cleaned = bridge.cleanupZombieSessions();
    log.info("Session cleanup triggered via API", { cleaned });
    return c.json({
      success: true,
      data: { cleaned },
    } satisfies ApiResponse);
  });

  app.get("/active/count", (c) => {
    return c.json({
      success: true,
      data: { count: countActiveSessions() },
    } satisfies ApiResponse);
  });

  // Resumable sessions — must be before /:id to avoid route conflict
  app.get("/resumable", (c) => {
    const search = c.req.query("q") ?? undefined;
    const projectSlug = c.req.query("project") ?? undefined;
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : undefined;
    const offset = c.req.query("offset") ? parseInt(c.req.query("offset")!, 10) : undefined;
    const resumable = listResumableSessions({ search, projectSlug, limit, offset });
    return c.json({ success: true, data: resumable } satisfies ApiResponse);
  });

  // Dismiss a resumable session (clear cliSessionId so it won't show up again)
  app.delete("/resumable/:id", (c) => {
    const id = c.req.param("id");
    const dismissed = dismissResumableSession(id);
    if (!dismissed) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true } satisfies ApiResponse);
  });

  app.post("/", zValidator("json", createSessionSchema), async (c) => {
    const body = c.req.valid("json");

    // Validate projectDir exists and is within allowed roots (prevents path traversal)
    const resolved = pathResolve(normalize(body.projectDir));

    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      return c.json(
        {
          success: false,
          error: "projectDir does not exist or is not a directory",
        } satisfies ApiResponse,
        400,
      );
    }

    const allowedRoots = process.env.ALLOWED_BROWSE_ROOTS;
    if (allowedRoots) {
      const roots = allowedRoots.split(";").map((r: string) => pathResolve(normalize(r)));
      const isAllowed = roots.some(
        (root: string) =>
          resolved === root || resolved.startsWith(root + "/") || resolved.startsWith(root + "\\"),
      );
      if (!isAllowed) {
        log.warn("Session creation blocked — projectDir outside allowed roots", {
          projectDir: resolved,
          allowedRoots,
        });
        return c.json(
          {
            success: false,
            error: "projectDir is outside allowed directories",
          } satisfies ApiResponse,
          403,
        );
      }
    }

    let project = body.projectSlug ? getProject(body.projectSlug) : null;
    let projectCreated = false;

    // Auto-create project if slug provided but doesn't exist
    if (body.projectSlug && !project) {
      const dirName = body.projectDir.split(/[\\/]/).filter(Boolean).pop() ?? body.projectSlug;
      upsertProject({
        slug: body.projectSlug,
        name: dirName,
        dir: body.projectDir,
        defaultModel: body.model ?? "claude-sonnet-4-6",
        permissionMode: body.permissionMode ?? "default",
      });
      project = getProject(body.projectSlug);
      projectCreated = true;
      log.info("Auto-created project", { slug: body.projectSlug, dir: body.projectDir });
    }

    const model = body.model ?? project?.defaultModel ?? "claude-sonnet-4-6";
    const permissionMode = body.permissionMode ?? project?.permissionMode ?? "default";

    // Resolve template variables if a templateId and templateVars are provided
    let resolvedPrompt = body.prompt;
    if (body.templateId) {
      const template = getTemplate(body.templateId);
      if (template) {
        const basePrompt = body.prompt ?? template.prompt;
        resolvedPrompt = body.templateVars
          ? resolveTemplateVariables(basePrompt, body.templateVars)
          : basePrompt;
      }
    }

    const activeCount = countActiveSessions();
    if (activeCount >= getMaxSessions()) {
      log.warn("Session limit reached", { activeCount, limit: getMaxSessions() });
      return c.json(
        {
          success: false,
          error: `Session limit reached (${getMaxSessions()} active). Stop an existing session before creating a new one.`,
        } satisfies ApiResponse,
        429,
      );
    }

    try {
      const sessionId = await bridge.startSession({
        projectSlug: body.projectSlug,
        cwd: body.projectDir,
        model,
        permissionMode,
        prompt: resolvedPrompt,
        resume: body.resume,
        cliSessionId: body.cliSessionId,
        source: body.source,
        envVars: project?.envVars,
        bare: body.bare,
        thinkingBudget: body.thinkingMode ? thinkingModeTobudget(body.thinkingMode) : undefined,
      });

      // Apply idle timeout / keep-alive settings from the request
      if (body.idleTimeoutMs !== undefined || body.keepAlive !== undefined) {
        bridge.setSessionSettings(sessionId, {
          ...(body.idleTimeoutMs !== undefined ? { idleTimeoutMs: body.idleTimeoutMs } : {}),
          ...(body.keepAlive !== undefined ? { keepAlive: body.keepAlive } : {}),
        });
      }

      log.info("Session created via API", { sessionId, model, projectCreated });
      return c.json(
        { success: true, data: { sessionId, projectCreated } } satisfies ApiResponse,
        201,
      );
    } catch (err) {
      log.error("Failed to create session", { error: String(err) });
      return c.json(
        { success: false, error: "Failed to create session" } satisfies ApiResponse,
        500,
      );
    }
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const active = bridge.getSession(id);
    if (active) {
      return c.json({
        success: true,
        data: { ...active.state, isActive: true },
      } satisfies ApiResponse);
    }
    const record = getSessionRecord(id);
    if (!record) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: { ...record, isActive: false } } satisfies ApiResponse);
  });

  app.post("/:id/messages", zValidator("json", sendMessageSchema), (c) => {
    const id = c.req.param("id");
    const { content, source } = c.req.valid("json");
    const session = bridge.getSession(id);
    if (!session) {
      return c.json({ success: false, error: "Session not active" } satisfies ApiResponse, 404);
    }
    bridge.sendUserMessage(id, content, source);
    return c.json({ success: true } satisfies ApiResponse);
  });

  app.get("/:id/messages", (c) => {
    const id = c.req.param("id");
    const beforeParam = c.req.query("before");
    const before = beforeParam ? parseInt(beforeParam, 10) : undefined;

    if (before !== undefined) {
      // Cursor-based pagination: newest-first, get messages older than `before` timestamp
      const limit = Math.min(Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)), 200);
      const { items: messages, total } = getSessionMessages(id, { limit, before });
      const hasMore = messages.length > 0 && messages[0]!.timestamp > 0 && total > messages.length;
      return c.json({
        success: true,
        data: { messages, hasMore },
        meta: { total, page: 1, limit },
      } satisfies ApiResponse);
    }

    const { limit, offset } = paginationSchema.parse({
      limit: c.req.query("limit") ?? "200",
      offset: c.req.query("offset"),
    });
    const { items: messages, total } = getSessionMessages(id, { limit, offset });
    const hasMore = offset + messages.length < total;
    return c.json({
      success: true,
      data: { messages, hasMore },
      meta: { total, page: Math.floor(offset / limit) + 1, limit },
    } satisfies ApiResponse);
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    bridge.killSession(id);
    return c.json({ success: true } satisfies ApiResponse);
  });

  // Permission response — behavior required, no default to prevent accidental allow
  app.post("/:id/permissions/:requestId", zValidator("json", permissionResponseSchema), (c) => {
    const sessionId = c.req.param("id");
    const requestId = c.req.param("requestId");
    const { behavior } = c.req.valid("json");
    const session = bridge.getSession(sessionId);
    if (!session) {
      return c.json({ success: false, error: "Session not active" } satisfies ApiResponse, 404);
    }
    bridge.handleBrowserMessage(
      sessionId,
      JSON.stringify({
        type: "permission_response",
        request_id: requestId,
        behavior,
      }),
    );
    log.info("Permission response", { sessionId, requestId, behavior });
    return c.json({ success: true } satisfies ApiResponse);
  });

  // Session settings (idle timeout, keep-alive)
  app.patch("/:id/settings", zValidator("json", sessionSettingsSchema), (c) => {
    const sessionId = c.req.param("id");
    const body = c.req.valid("json");
    const session = bridge.getSession(sessionId);
    if (!session) {
      return c.json({ success: false, error: "Session not active" } satisfies ApiResponse, 404);
    }
    bridge.setSessionSettings(sessionId, body);
    const settings = bridge.getSessionSettings(sessionId);
    log.info("Session settings updated via API", { sessionId, settings });
    return c.json({ success: true, data: settings } satisfies ApiResponse);
  });

  // Rename session
  const renameSchema = z.object({ name: z.string().max(100).nullable() });
  app.patch("/:id/rename", zValidator("json", renameSchema), (c) => {
    const sessionId = c.req.param("id");
    const record = getSessionRecord(sessionId);
    if (!record) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }
    const { name } = c.req.valid("json");
    const ok = renameSession(sessionId, name);
    if (!ok) {
      return c.json(
        { success: false, error: "Failed to rename session" } satisfies ApiResponse,
        500,
      );
    }
    log.info("Session renamed", { sessionId, name });
    return c.json({ success: true, data: { name } } satisfies ApiResponse);
  });

  // Update session config (compact mode, budget, etc.)
  const configSchema = z.object({
    costBudgetUsd: z.number().min(0.01).nullable().optional(),
    compactMode: z.enum(["manual", "smart", "aggressive"]).optional(),
    compactThreshold: z.number().int().min(50).max(95).optional(),
  });
  app.patch("/:id/config", zValidator("json", configSchema), (c) => {
    const sessionId = c.req.param("id");
    const record = getSessionRecord(sessionId);
    if (!record) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }
    const body = c.req.valid("json");
    const ok = updateSessionConfig(sessionId, body);
    if (!ok) {
      return c.json(
        { success: false, error: "Failed to update config" } satisfies ApiResponse,
        500,
      );
    }
    log.info("Session config updated", { sessionId, ...body });
    return c.json({ success: true, data: body } satisfies ApiResponse);
  });

  // Get session settings
  app.get("/:id/settings", (c) => {
    const sessionId = c.req.param("id");
    const session = bridge.getSession(sessionId);
    if (!session) {
      return c.json({ success: false, error: "Session not active" } satisfies ApiResponse, 404);
    }
    return c.json({
      success: true,
      data: bridge.getSessionSettings(sessionId),
    } satisfies ApiResponse);
  });

  // Resume an ended session
  app.post("/:id/resume", async (c) => {
    const id = c.req.param("id");
    const record = getSessionRecord(id);
    if (!record) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }
    if (record.status !== "ended") {
      return c.json({ success: false, error: "Session is not ended" } satisfies ApiResponse, 400);
    }
    if (!record.cliSessionId) {
      return c.json(
        {
          success: false,
          error: "Session has no CLI session ID — cannot resume",
        } satisfies ApiResponse,
        400,
      );
    }

    const activeCount = countActiveSessions();
    if (activeCount >= getMaxSessions()) {
      return c.json(
        {
          success: false,
          error: `Session limit reached (${getMaxSessions()} active). Stop an existing session before resuming.`,
        } satisfies ApiResponse,
        429,
      );
    }

    try {
      const sessionId = await bridge.startSession({
        projectSlug: record.projectSlug ?? undefined,
        cwd: record.cwd,
        model: record.model,
        permissionMode: record.permissionMode,
        resume: true,
        cliSessionId: record.cliSessionId,
        source: "api",
      });

      // Clear cliSessionId on old session so it won't appear in resumable list again
      dismissResumableSession(id);

      log.info("Session resumed via API", { originalId: id, newSessionId: sessionId });
      return c.json({ success: true, data: { sessionId } } satisfies ApiResponse, 201);
    } catch (err) {
      log.error("Failed to resume session", { id, error: String(err) });
      return c.json(
        { success: false, error: "Failed to resume session" } satisfies ApiResponse,
        500,
      );
    }
  });

  // ── Stream to Telegram ─────────────────────────────────────────────────

  // Get stream status for a session
  app.get("/:id/stream/telegram", (c) => {
    const sessionId = c.req.param("id");

    const tgBridge = botRegistry?.getPrimary?.();
    if (!tgBridge) {
      return c.json({ success: true, data: { streaming: false } } satisfies ApiResponse);
    }

    const sub = tgBridge.getStreamSubscriberForSession(sessionId);
    return c.json({
      success: true,
      data: {
        streaming: !!sub,
        chatId: sub?.chatId,
        topicId: sub?.topicId,
      },
    } satisfies ApiResponse);
  });

  app.post("/:id/stream/telegram", async (c) => {
    const sessionId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { chatId?: number; topicId?: number };

    if (!body.chatId) {
      return c.json({ success: false, error: "chatId is required" } satisfies ApiResponse, 400);
    }

    const tgBridge = botRegistry?.getPrimary?.();
    if (!tgBridge) {
      return c.json(
        { success: false, error: "No Telegram bot running" } satisfies ApiResponse,
        503,
      );
    }

    const session = bridge.getSession(sessionId);
    if (!session) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }

    const ok = tgBridge.attachStreamToSession(sessionId, body.chatId, body.topicId);
    if (!ok) {
      return c.json(
        { success: false, error: "Failed to attach stream" } satisfies ApiResponse,
        500,
      );
    }

    return c.json({
      success: true,
      data: { sessionId, chatId: body.chatId, streaming: true },
    } satisfies ApiResponse);
  });

  // Detach stream — server does reverse lookup, no chatId needed from client
  app.delete("/:id/stream/telegram", (c) => {
    const sessionId = c.req.param("id");

    const tgBridge = botRegistry?.getPrimary?.();
    if (!tgBridge) {
      return c.json(
        { success: false, error: "No Telegram bot running" } satisfies ApiResponse,
        503,
      );
    }

    const sub = tgBridge.getStreamSubscriberForSession(sessionId);
    if (!sub) {
      return c.json({ success: true, data: { sessionId, detached: false } } satisfies ApiResponse);
    }

    const detached = tgBridge.detachStream(sub.chatId, sub.topicId);
    return c.json({
      success: true,
      data: { sessionId, detached: !!detached },
    } satisfies ApiResponse);
  });

  // ── Session Summary ────────────────────────────────────────────────────

  app.get("/:id/summary", (c) => {
    const id = c.req.param("id");
    const summary = getSessionSummary(id);
    if (!summary) {
      return c.json({ success: true, data: null } satisfies ApiResponse);
    }
    return c.json({ success: true, data: summary } satisfies ApiResponse);
  });

  // ── Export session as markdown or JSON ─────────────────────────────────

  app.get("/:id/export", (c) => {
    const id = c.req.param("id");
    const format = c.req.query("format") === "json" ? "json" : "md";
    const session = getSessionRecord(id);

    if (!session) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }

    const { items: msgs } = getSessionMessages(id, { limit: 10000 });
    const filenameBase = `session-${session.projectSlug ?? "quick"}-${id.slice(0, 8)}`;

    if (format === "json") {
      const payload = JSON.stringify(
        {
          session: {
            id,
            projectSlug: session.projectSlug ?? null,
            model: session.model,
            status: session.status,
            startedAt: session.startedAt?.toISOString() ?? null,
            endedAt: session.endedAt?.toISOString() ?? null,
            numTurns: session.numTurns,
            totalCostUsd: session.totalCostUsd,
            totalInputTokens: session.totalInputTokens,
            totalOutputTokens: session.totalOutputTokens,
          },
          messages: msgs,
        },
        null,
        2,
      );

      return new Response(payload, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
        },
      });
    }

    // Markdown format
    const date = session.startedAt
      ? new Date(session.startedAt).toISOString().slice(0, 19).replace("T", " ")
      : "unknown";

    const lines: string[] = [
      `# Session: ${session.projectSlug ?? "Quick Session"}`,
      ``,
      `Model: ${session.model} | Created: ${date} | Cost: $${session.totalCostUsd.toFixed(4)}`,
      ``,
      `---`,
      ``,
    ];

    for (const msg of msgs) {
      const heading =
        msg.role === "user"
          ? "## User"
          : msg.role === "assistant"
            ? "## Assistant"
            : `## ${msg.role}`;
      lines.push(heading);
      lines.push(``);
      lines.push(msg.content);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }

    const markdown = lines.join("\n");

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.md"`,
      },
    });
  });

  // Update session tags
  const tagsSchema = z.object({
    tags: z.array(z.string().max(50)).max(20),
  });
  app.patch("/:id/tags", zValidator("json", tagsSchema), (c) => {
    const sessionId = c.req.param("id");
    const record = getSessionRecord(sessionId);
    if (!record) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }
    const { tags } = c.req.valid("json");
    const ok = updateSessionTags(sessionId, tags);
    if (!ok) {
      return c.json({ success: false, error: "Failed to update tags" } satisfies ApiResponse, 500);
    }
    log.info("Session tags updated", { sessionId, tags });
    return c.json({ success: true, data: { tags } } satisfies ApiResponse);
  });

  // ── Snapshots ───────────────────────────────────────────────────────────────

  // POST /:id/snapshots — capture current terminal screen
  const snapshotSchema = z.object({
    label: z.string().max(100).optional(),
  });
  app.post("/:id/snapshots", zValidator("json", snapshotSchema), (c) => {
    const sessionId = c.req.param("id");
    const session = bridge.getSession(sessionId);
    if (!session) {
      return c.json(
        { success: false, error: "Session not found or not active" } satisfies ApiResponse,
        404,
      );
    }
    const { label } = c.req.valid("json");
    const content = session.virtualScreen.toString();
    if (!content.trim()) {
      return c.json({ success: false, error: "Screen buffer is empty" } satisfies ApiResponse, 400);
    }

    try {
      const db = getDb();
      const result = db
        .insert(sessionSnapshots)
        .values({
          sessionId,
          content,
          label: label ?? null,
        })
        .returning()
        .get();
      const id = result.id;

      log.info("Snapshot captured", { sessionId, id, contentLength: content.length });
      return c.json({
        success: true,
        data: { id, contentLength: content.length },
      } satisfies ApiResponse);
    } catch (err) {
      log.error("Failed to save snapshot", { sessionId, error: String(err) });
      return c.json(
        { success: false, error: "Failed to save snapshot" } satisfies ApiResponse,
        500,
      );
    }
  });

  // GET /:id/snapshots — list snapshots for a session
  app.get("/:id/snapshots", (c) => {
    const sessionId = c.req.param("id");
    const record = getSessionRecord(sessionId);
    if (!record) {
      return c.json({ success: false, error: "Session not found" } satisfies ApiResponse, 404);
    }

    const db = getDb();
    const snapshots = db
      .select()
      .from(sessionSnapshots)
      .where(eqOp(sessionSnapshots.sessionId, sessionId))
      .orderBy(descOp(sessionSnapshots.createdAt))
      .limit(50)
      .all();

    return c.json({
      success: true,
      data: snapshots.map(
        (s: { id: number; content: string; label: string | null; createdAt: Date }) => ({
          id: s.id,
          label: s.label,
          contentLength: s.content.length,
          contentPreview: s.content.slice(0, 200),
          createdAt: s.createdAt,
        }),
      ),
    } satisfies ApiResponse);
  });

  // GET /:id/snapshots/:snapshotId — get full snapshot content
  app.get("/:id/snapshots/:snapshotId", (c) => {
    const sessionId = c.req.param("id");
    const snapshotId = parseInt(c.req.param("snapshotId"), 10);
    if (isNaN(snapshotId)) {
      return c.json({ success: false, error: "Invalid snapshot ID" } satisfies ApiResponse, 400);
    }

    const db = getDb();
    const snapshot = db
      .select()
      .from(sessionSnapshots)
      .where(
        andOp(eqOp(sessionSnapshots.id, snapshotId), eqOp(sessionSnapshots.sessionId, sessionId)),
      )
      .get();

    if (!snapshot) {
      return c.json({ success: false, error: "Snapshot not found" } satisfies ApiResponse, 404);
    }

    return c.json({ success: true, data: snapshot } satisfies ApiResponse);
  });

  return app;
}
