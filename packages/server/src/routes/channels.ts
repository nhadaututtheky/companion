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
import { createLogger } from "../logger.js";
import type { ApiResponse } from "@companion/shared";

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
    return c.json({ success: false, error: String(err) } satisfies ApiResponse, 500);
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
channelRoutes.post(
  "/:id/messages",
  zValidator("json", postMessageSchema),
  (c) => {
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
      });

      return c.json({ success: true, data: message } satisfies ApiResponse, 201);
    } catch (err) {
      log.error("Failed to post message", { channelId: id, error: String(err) });
      return c.json({ success: false, error: String(err) } satisfies ApiResponse, 500);
    }
  },
);

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
    return c.json({ success: false, error: String(err) } satisfies ApiResponse, 500);
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
    return c.json({ success: false, error: String(err) } satisfies ApiResponse, 400);
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
    return c.json({ success: false, error: String(err) } satisfies ApiResponse, 500);
  }
});

// POST /channels/debate — start a debate (API)
channelRoutes.post("/debate", async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    topic?: string;
    format?: string;
    projectSlug?: string;
    maxRounds?: number;
  };

  if (!body.topic) {
    return c.json({ success: false, error: "topic is required" } satisfies ApiResponse, 400);
  }

  try {
    const state = await startDebate({
      topic: body.topic,
      format: (body.format as "pro_con" | "red_team" | "review" | "brainstorm") ?? "pro_con",
      projectSlug: body.projectSlug,
      maxRounds: body.maxRounds,
    });

    return c.json({
      success: true,
      data: {
        channelId: state.channelId,
        topic: state.topic,
        format: state.format,
        agents: state.agents.map((a) => ({ id: a.id, label: a.label, role: a.role })),
      },
    } satisfies ApiResponse, 201);
  } catch (err) {
    return c.json({ success: false, error: String(err) } satisfies ApiResponse, 500);
  }
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
