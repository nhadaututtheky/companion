/**
 * Channel REST routes — shared context channels for multi-session collaboration.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createChannel,
  getChannel,
  listChannels,
  postMessage,
  linkSession,
  unlinkSession,
  updateChannelStatus,
  deleteChannel,
} from "../services/channel-manager.js";
import { startDebate, concludeDebate, getActiveDebate } from "../services/debate-engine.js";
import { startCLIDebate, abortCLIDebate } from "../services/cli-debate-engine.js";
import { createLogger } from "../logger.js";
import type { ApiResponse, CLIPlatform } from "@companion/shared";
import { hasFeature } from "../services/license.js";

const log = createLogger("routes:channels");

const createChannelSchema = z.object({
  projectSlug: z.string().optional(),
  type: z.enum(["debate", "review", "red_team", "brainstorm"]),
  topic: z.string().min(1).max(500),
  maxRounds: z.number().int().min(1).max(20).optional(),
});

const postMessageSchema = z.object({
  agentId: z.string().min(1),
  role: z.enum(["advocate", "challenger", "judge", "reviewer", "human"]),
  content: z.string().min(1).max(50000),
  round: z.number().int().min(0).optional(),
  personaId: z.string().max(100).optional(),
});

const linkSessionSchema = z.object({
  sessionId: z.string().min(1),
});

const patchChannelSchema = z.object({
  status: z.enum(["active", "concluding", "concluded"]),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const channelRoutes = new Hono();

// GET /channels — list all channels
channelRoutes.get("/", (c) => {
  const projectSlug = c.req.query("project");
  const status = c.req.query("status");
  const { limit, offset } = paginationSchema.parse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });

  const { items, total } = listChannels({ projectSlug, status, limit, offset });

  return c.json({
    success: true,
    data: items,
    meta: { total, page: Math.floor(offset / limit) + 1, limit },
  } satisfies ApiResponse);
});

// POST /channels — create channel
channelRoutes.post("/", zValidator("json", createChannelSchema), (c) => {
  const body = c.req.valid("json");

  try {
    const channel = createChannel({
      projectSlug: body.projectSlug,
      type: body.type,
      topic: body.topic,
      maxRounds: body.maxRounds,
    });

    log.info("Channel created via API", { id: channel.id, type: body.type });
    return c.json({ success: true, data: channel } satisfies ApiResponse, 201);
  } catch (err) {
    log.error("Failed to create channel", { error: String(err) });
    return c.json({ success: false, error: "Failed to create channel" } satisfies ApiResponse, 500);
  }
});

// GET /channels/:id — get channel with messages and linked sessions
channelRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  const channel = getChannel(id);

  if (!channel) {
    return c.json({ success: false, error: "Channel not found" } satisfies ApiResponse, 404);
  }

  return c.json({ success: true, data: channel } satisfies ApiResponse);
});

// POST /channels/:id/messages — post message to channel
channelRoutes.post("/:id/messages", zValidator("json", postMessageSchema), (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const channel = getChannel(id);
  if (!channel) {
    return c.json({ success: false, error: "Channel not found" } satisfies ApiResponse, 404);
  }

  try {
    const message = postMessage({
      channelId: id,
      agentId: body.agentId,
      role: body.role,
      content: body.content,
      round: body.round,
      personaId: body.personaId,
    });

    return c.json({ success: true, data: message } satisfies ApiResponse, 201);
  } catch (err) {
    log.error("Failed to post message", { channelId: id, error: String(err) });
    return c.json({ success: false, error: "Failed to post message" } satisfies ApiResponse, 500);
  }
});

// PATCH /channels/:id — update channel status
channelRoutes.patch("/:id", zValidator("json", patchChannelSchema), (c) => {
  const id = c.req.param("id");
  const { status } = c.req.valid("json");

  const channel = getChannel(id);
  if (!channel) {
    return c.json({ success: false, error: "Channel not found" } satisfies ApiResponse, 404);
  }

  try {
    updateChannelStatus(id, status);
    return c.json({ success: true } satisfies ApiResponse);
  } catch (err) {
    log.error("Failed to update channel status", { id, error: String(err) });
    return c.json(
      { success: false, error: "Failed to update channel status" } satisfies ApiResponse,
      500,
    );
  }
});

// POST /channels/:id/link — link a session to this channel
channelRoutes.post("/:id/link", zValidator("json", linkSessionSchema), (c) => {
  const id = c.req.param("id");
  const { sessionId } = c.req.valid("json");

  try {
    linkSession(id, sessionId);
    return c.json({ success: true } satisfies ApiResponse);
  } catch (err) {
    log.error("Failed to link session", { channelId: id, sessionId, error: String(err) });
    return c.json({ success: false, error: "Failed to link session" } satisfies ApiResponse, 400);
  }
});

// DELETE /channels/:id/sessions/:sessionId — unlink session from channel
channelRoutes.delete("/:id/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    unlinkSession(sessionId);
    return c.json({ success: true } satisfies ApiResponse);
  } catch (err) {
    log.error("Failed to unlink session", { sessionId, error: String(err) });
    return c.json({ success: false, error: "Failed to unlink session" } satisfies ApiResponse, 500);
  }
});

// POST /channels/debate — start a debate (API)
const agentModelSchema = z.object({
  agentId: z.string().min(1),
  model: z.string().min(1),
  label: z.string().optional(),
  personaId: z.string().max(100).optional(),
});

const debateSchema = z.object({
  topic: z.string().min(1).max(500),
  format: z.enum(["pro_con", "red_team", "review", "brainstorm"]).default("pro_con"),
  projectSlug: z.string().optional(),
  maxRounds: z.number().int().min(1).max(20).optional(),
  agentModels: z
    .array(agentModelSchema)
    .max(4)
    .refine((arr) => !arr || new Set(arr.map((a) => a.agentId)).size === arr.length, {
      message: "Duplicate agentId in agentModels",
    })
    .optional(),
});

channelRoutes.post("/debate", zValidator("json", debateSchema), async (c) => {
  const body = c.req.valid("json");

  try {
    const state = await startDebate({
      topic: body.topic,
      format: body.format,
      projectSlug: body.projectSlug,
      maxRounds: body.maxRounds,
      agentModels: body.agentModels,
    });

    return c.json(
      {
        success: true,
        data: {
          channelId: state.channelId,
          topic: state.topic,
          format: state.format,
          agents: state.agents.map((a) => ({
            id: a.id,
            label: a.label,
            role: a.role,
            model: a.model,
            modelLabel: a.modelLabel,
            personaId: a.personaId,
            personaLabel: a.personaLabel,
          })),
        },
      } satisfies ApiResponse,
      201,
    );
  } catch {
    return c.json({ success: false, error: "Failed to start debate" } satisfies ApiResponse, 500);
  }
});

// ── CLI Debate ─────────────────────────────────────────────────────────────

const cliDebateAgentSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  label: z.string().min(1),
  emoji: z.string().default("🤖"),
  platform: z.enum(["claude", "codex", "gemini", "opencode"]),
  model: z.string().min(1),
  platformOptions: z.record(z.unknown()).optional(),
});

const cliDebateSchema = z.object({
  topic: z.string().min(1).max(500),
  format: z.enum(["pro_con", "code_review", "architecture", "benchmark"]).default("pro_con"),
  agents: z.array(cliDebateAgentSchema).min(2).max(4),
  workingDir: z.string().min(1).max(500),
  projectSlug: z.string().optional(),
  maxRounds: z.number().int().min(1).max(10).optional(),
});

channelRoutes.post("/cli-debate", zValidator("json", cliDebateSchema), async (c) => {
  if (!hasFeature("debate_multiplatform")) {
    return c.json(
      { success: false, error: "Multi-platform debate requires Companion Pro." } satisfies ApiResponse,
      403,
    );
  }
  const body = c.req.valid("json");

  try {
    const state = await startCLIDebate(
      {
        topic: body.topic,
        format: body.format,
        agents: body.agents.map((a) => ({
          ...a,
          platform: a.platform as CLIPlatform,
        })),
        workingDir: body.workingDir,
        projectSlug: body.projectSlug,
        maxRounds: body.maxRounds,
      },
      (msg) => {
        log.info("CLI debate event", msg);
        // TODO: broadcast to WebSocket subscribers in Phase 5
      },
    );

    return c.json(
      {
        success: true,
        data: {
          channelId: state.channelId,
          topic: state.topic,
          format: state.format,
          agents: state.agents.map((a) => ({
            id: a.id,
            label: a.label,
            role: a.role,
            platform: a.platform,
            model: a.model,
          })),
        },
      } satisfies ApiResponse,
      201,
    );
  } catch (err) {
    return c.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to start CLI debate" } satisfies ApiResponse,
      500,
    );
  }
});

// POST /channels/:id/abort-cli — abort CLI debate (kills processes)
channelRoutes.post("/:id/abort-cli", (c) => {
  const id = c.req.param("id");
  const aborted = abortCLIDebate(id);

  if (!aborted) {
    // Try regular debate conclude
    const debate = getActiveDebate(id);
    if (!debate) {
      return c.json({ success: false, error: "No active CLI debate found" } satisfies ApiResponse, 404);
    }
  }

  return c.json({ success: true, data: { aborted: true } } satisfies ApiResponse);
});

// POST /channels/:id/conclude — force conclude a debate
channelRoutes.post("/:id/conclude", async (c) => {
  const id = c.req.param("id");
  const debate = getActiveDebate(id);

  if (!debate) {
    return c.json({ success: false, error: "No active debate found" } satisfies ApiResponse, 404);
  }

  const verdict = await concludeDebate(id);
  return c.json({ success: true, data: { verdict } } satisfies ApiResponse);
});

// DELETE /channels/:id — delete channel
channelRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const deleted = deleteChannel(id);

  if (!deleted) {
    return c.json({ success: false, error: "Channel not found" } satisfies ApiResponse, 404);
  }

  return c.json({ success: true } satisfies ApiResponse);
});
