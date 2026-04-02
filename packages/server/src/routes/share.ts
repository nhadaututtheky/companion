/**
 * Share token REST routes for QR Stream Sharing.
 * POST /api/sessions/:id/share  — create share token
 * GET  /api/sessions/:id/shares — list active shares for session
 * GET  /api/share/:token        — validate token (public, no auth)
 * DELETE /api/share/:token      — revoke token
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  createShareToken,
  validateShareToken,
  revokeShareToken,
  listActiveShares,
} from "../services/share-manager.js";
import { disconnectByToken } from "../services/spectator-bridge.js";
import type { ApiResponse } from "@companion/shared";

// ── Protected routes (require auth) ─────────────────────────────────────────

export const shareRoutes = new Hono();

const createShareSchema = z.object({
  permission: z.enum(["read-only", "interactive"]).optional().default("read-only"),
  expiresInHours: z.number().min(1).max(168).optional().default(24), // 1h to 7d
});

// Create share token for a session
shareRoutes.post("/sessions/:id/share", zValidator("json", createShareSchema), (c) => {
  const sessionId = c.req.param("id");
  const { permission, expiresInHours } = c.req.valid("json");

  try {
    const token = createShareToken({
      sessionId,
      permission,
      expiresInMs: expiresInHours * 60 * 60 * 1000,
    });

    return c.json({
      success: true,
      data: {
        token: token.token,
        permission: token.permission,
        expiresAt: token.expiresAt.toISOString(),
      },
    } satisfies ApiResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create share token";
    return c.json({ success: false, error: message } satisfies ApiResponse, 400);
  }
});

// List active shares for a session
shareRoutes.get("/sessions/:id/shares", (c) => {
  const sessionId = c.req.param("id");
  const shares = listActiveShares(sessionId);

  return c.json({
    success: true,
    data: shares.map((s) => ({
      token: s.token,
      permission: s.permission,
      createdBy: s.createdBy,
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    })),
  } satisfies ApiResponse);
});

// Revoke a share token
shareRoutes.delete("/share/:token", (c) => {
  const token = c.req.param("token");
  const revoked = revokeShareToken(token);

  if (!revoked) {
    return c.json(
      { success: false, error: "Token not found or already revoked" } satisfies ApiResponse,
      404,
    );
  }

  disconnectByToken(token);
  return c.json({ success: true } satisfies ApiResponse);
});

// ── Public routes (no auth) ─────────────────────────────────────────────────

export const publicShareRoutes = new Hono();

// Validate share token (public — spectators use this)
publicShareRoutes.get("/share/:token", (c) => {
  const token = c.req.param("token");
  const result = validateShareToken(token);

  if (!result) {
    return c.json(
      { success: false, error: "Invalid or expired share token" } satisfies ApiResponse,
      404,
    );
  }

  return c.json({
    success: true,
    data: {
      sessionId: result.sessionId,
      sessionName: result.sessionName,
      permission: result.permission,
      expiresAt: result.expiresAt.toISOString(),
    },
  } satisfies ApiResponse);
});
