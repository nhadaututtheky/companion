/**
 * HTTP Hook receiver — Claude Code POSTs lifecycle events here.
 *
 * Route: POST /api/hooks/:sessionId
 *
 * NOTE: This endpoint does NOT require API key auth because Claude Code
 * CLI sends hooks without auth headers. Security is via session ID (UUID)
 * which is unguessable + only valid for active sessions.
 */

import { Hono } from "hono";
import { createLogger } from "../logger.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { HookEvent, HookEventType, PreToolUseResponse, HookAckResponse } from "@companion/shared";

const _log = createLogger("hooks");

const VALID_HOOK_TYPES = new Set<HookEventType>(["PreToolUse", "PostToolUse", "Stop", "Notification"]);

export function hookRoutes(bridge: WsBridge): Hono {
  const app = new Hono();

  app.post("/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");

    let body: HookEvent;
    try {
      body = await c.req.json<HookEvent>();
    } catch {
      return c.json({ ok: false, error: "Invalid JSON" }, 400);
    }

    // Validate hook type
    if (!body.type || !VALID_HOOK_TYPES.has(body.type)) {
      return c.json({ ok: false, error: `Invalid hook type: ${body.type}` }, 400);
    }

    // Route event to session
    const result = bridge.handleHookEvent(sessionId, body);

    if (!result.found) {
      return c.json({ ok: false, error: "Session not found" }, 404);
    }

    // PreToolUse can return a decision
    if (body.type === "PreToolUse") {
      const response: PreToolUseResponse = result.decision ?? { decision: "allow" };
      return c.json(response);
    }

    // All other types get simple ack
    const ack: HookAckResponse = { ok: true };
    return c.json(ack);
  });

  return app;
}
