/**
 * RTK harness routes — used by `companion_compress` MCP tool and the
 * web settings panel. Both endpoints are tiny: compress a blob, and
 * read/write the auto-compress config.
 */

import { Hono } from "hono";
import {
  compressText,
  getAutoCompressConfig,
  resetAutoCompressConfigCache,
  HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD,
} from "../rtk/api.js";
import { setSetting } from "../services/settings-helpers.js";
import type { ApiResponse } from "@companion/shared";

const MAX_INPUT_CHARS = 1_000_000; // 1MB cap to bound CPU
const MIN_BUDGET_TOKENS = 100;
const MAX_BUDGET_TOKENS = 32_000;
const MIN_THRESHOLD_TOKENS = 500;
const MAX_THRESHOLD_TOKENS = 32_000;

export const rtkRoutes = new Hono();

/**
 * POST /api/rtk/compress
 * Body: { text: string, budget_tokens?: number, session_id?: string, tool_name?: string }
 *
 * Returns the compressed text + token / strategy metrics. Used by the
 * `companion_compress` MCP tool and by the auto-chain wrapper before
 * returning oversized tool outputs to the agent.
 */
rtkRoutes.post("/compress", async (c) => {
  let body: {
    text?: string;
    budget_tokens?: number;
    session_id?: string;
    tool_name?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" } satisfies ApiResponse, 400);
  }

  if (typeof body.text !== "string" || body.text.length === 0) {
    return c.json(
      { success: false, error: "`text` field is required (non-empty string)" } satisfies ApiResponse,
      400,
    );
  }
  if (body.text.length > MAX_INPUT_CHARS) {
    return c.json(
      {
        success: false,
        error: `Input exceeds ${MAX_INPUT_CHARS}-char cap; pre-truncate before calling`,
      } satisfies ApiResponse,
      413,
    );
  }

  const requestedBudget =
    typeof body.budget_tokens === "number" && Number.isFinite(body.budget_tokens)
      ? body.budget_tokens
      : undefined;
  if (
    requestedBudget !== undefined &&
    (requestedBudget < MIN_BUDGET_TOKENS || requestedBudget > MAX_BUDGET_TOKENS)
  ) {
    return c.json(
      {
        success: false,
        error: `budget_tokens must be ${MIN_BUDGET_TOKENS}..${MAX_BUDGET_TOKENS}`,
      } satisfies ApiResponse,
      400,
    );
  }

  const result = compressText(body.text, {
    budgetTokens: requestedBudget,
    sessionId: body.session_id,
    toolName: body.tool_name,
  });

  return c.json({ success: true, data: result } satisfies ApiResponse);
});

/**
 * GET /api/rtk/auto-compress-config
 * Returns the current auto-compress settings (cached 30s server-side).
 */
rtkRoutes.get("/auto-compress-config", (c) => {
  return c.json({
    success: true,
    data: {
      ...getAutoCompressConfig(),
      defaultThresholdTokens: HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD,
    },
  } satisfies ApiResponse);
});

/**
 * POST /api/rtk/auto-compress-config
 * Body: { enabled?: boolean, thresholdTokens?: number }
 *
 * Persists settings then invalidates the in-process cache so the
 * next call sees the new value.
 */
rtkRoutes.post("/auto-compress-config", async (c) => {
  let body: { enabled?: unknown; thresholdTokens?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" } satisfies ApiResponse, 400);
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return c.json(
        { success: false, error: "`enabled` must be a boolean" } satisfies ApiResponse,
        400,
      );
    }
    setSetting("harness.autoCompressEnabled", body.enabled ? "true" : "false");
  }

  if (body.thresholdTokens !== undefined) {
    if (typeof body.thresholdTokens !== "number" || !Number.isFinite(body.thresholdTokens)) {
      return c.json(
        { success: false, error: "`thresholdTokens` must be a finite number" } satisfies ApiResponse,
        400,
      );
    }
    if (
      body.thresholdTokens < MIN_THRESHOLD_TOKENS ||
      body.thresholdTokens > MAX_THRESHOLD_TOKENS
    ) {
      return c.json(
        {
          success: false,
          error: `thresholdTokens must be ${MIN_THRESHOLD_TOKENS}..${MAX_THRESHOLD_TOKENS}`,
        } satisfies ApiResponse,
        400,
      );
    }
    setSetting("harness.autoCompressThreshold", String(Math.floor(body.thresholdTokens)));
  }

  resetAutoCompressConfigCache();
  return c.json({ success: true, data: getAutoCompressConfig() } satisfies ApiResponse);
});
