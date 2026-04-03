/**
 * HTTP Hook receiver — Claude Code POSTs lifecycle events here.
 *
 * Route: POST /api/hooks/:sessionId/:hookSecret
 *
 * Security: Hook secret is a per-session random token embedded in the URL.
 * Generated at session creation, injected into Claude Code settings.
 * Prevents spectators from injecting fake hook events via session ID alone.
 */

import { Hono } from "hono";
import { createLogger } from "../logger.js";
import { getActiveSession } from "../services/session-store.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type {
  HookEvent,
  HookEventType,
  PreToolUseResponse,
  HookAckResponse,
} from "@companion/shared";

const _log = createLogger("hooks");

const VALID_HOOK_TYPES = new Set<HookEventType>([
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "Notification",
]);

export function hookRoutes(bridge: WsBridge): Hono {
  const app = new Hono();

  app.post("/:sessionId/:hookSecret", async (c) => {
    const sessionId = c.req.param("sessionId");
    const hookSecret = c.req.param("hookSecret");

    // Verify hook secret matches the session's secret
    const session = getActiveSession(sessionId);
    if (!session || session.hookSecret !== hookSecret) {
      return c.json({ ok: false, error: "Unauthorized" }, 403);
    }

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
