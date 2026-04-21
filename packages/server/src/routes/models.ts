/**
 * Models API — Returns available AI models grouped by provider.
 *
 * GET /api/models — list all available models (free + configured)
 * GET /api/models/health — check which providers are reachable
 * POST /api/models/providers/:id/toggle — enable/disable a provider
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  getModelsGrouped,
  checkProvidersHealth,
  invalidateCache,
  getProviders,
} from "../services/provider-registry.js";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { ApiResponse } from "@companion/shared";

export const modelRoutes = new Hono();

/** GET /models — list all available models grouped by provider */
modelRoutes.get("/", (c) => {
  const grouped = getModelsGrouped();

  return c.json({
    success: true,
    data: {
      free: grouped.free.map((g) => ({
        provider: {
          id: g.provider.id,
          name: g.provider.name,
          type: g.provider.type,
          enabled: g.provider.enabled,
          healthStatus: g.provider.healthStatus,
        },
        models: g.models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          contextWindow: m.contextWindow,
          free: m.free,
          capabilities: m.capabilities,
          maxOutputTokens: m.maxOutputTokens,
        })),
      })),
      configured: grouped.configured.map((g) => ({
        provider: {
          id: g.provider.id,
          name: g.provider.name,
          type: g.provider.type,
          enabled: g.provider.enabled,
          healthStatus: g.provider.healthStatus,
        },
        models: g.models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          contextWindow: m.contextWindow,
          free: m.free,
          capabilities: m.capabilities,
          maxOutputTokens: m.maxOutputTokens,
        })),
      })),
    },
  } satisfies ApiResponse);
});

/** GET /models/health — check health of all enabled providers */
modelRoutes.get("/health", async (c) => {
  const results = await checkProvidersHealth();

  return c.json({
    success: true,
    data: results,
  } satisfies ApiResponse);
});

/** POST /models/providers/:id/toggle — enable/disable a provider */
const toggleSchema = z.object({ enabled: z.boolean() });

modelRoutes.post("/providers/:id/toggle", async (c) => {
  const providerId = c.req.param("id");
  const parsed = toggleSchema.safeParse(await c.req.json().catch(() => null));

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Body must include { enabled: boolean }",
      } satisfies ApiResponse,
      400,
    );
  }

  const body = parsed.data;

  const key = `provider.${providerId}.disabled`;
  const db = getDb();

  if (body.enabled) {
    // Remove disabled flag
    db.delete(settings).where(eq(settings.key, key)).run();
  } else {
    // Set disabled flag
    db.insert(settings)
      .values({ key, value: "true" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "true" } })
      .run();
  }

  // Invalidate cache so next getProviders() reflects the change
  invalidateCache();

  return c.json({
    success: true,
    data: { providerId, enabled: body.enabled },
  } satisfies ApiResponse);
});

/** POST /models/test-connection — probe a provider with the user's config */
const testConnSchema = z.object({
  baseUrl: z.string().url().min(1),
  apiKey: z.string().optional().default(""),
  model: z.string().min(1),
});

modelRoutes.post("/test-connection", async (c) => {
  const parsed = testConnSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "baseUrl (valid URL) and model required",
      } satisfies ApiResponse,
      400,
    );
  }

  const { baseUrl, apiKey, model } = parsed.data;
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const started = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return c.json({
        success: true,
        data: {
          ok: false,
          status: res.status,
          latencyMs,
          error: body.slice(0, 300) || res.statusText,
        },
      } satisfies ApiResponse);
    }

    return c.json({
      success: true,
      data: { ok: true, status: res.status, latencyMs },
    } satisfies ApiResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({
      success: true,
      data: {
        ok: false,
        status: 0,
        latencyMs: Date.now() - started,
        error: msg.includes("aborted") ? "Timeout after 10s" : msg,
      },
    } satisfies ApiResponse);
  }
});

/** GET /models/ollama-tags — list installed Ollama models (if reachable) */
modelRoutes.get("/ollama-tags", async (c) => {
  const baseUrl = c.req.query("baseUrl") ?? "http://localhost:11434/v1";
  const host = baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return c.json({ success: true, data: { tags: [], reachable: false } });
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return c.json({
      success: true,
      data: { tags: (data.models ?? []).map((m) => m.name), reachable: true },
    } satisfies ApiResponse);
  } catch {
    return c.json({ success: true, data: { tags: [], reachable: false } });
  }
});

/** GET /models/providers — list all providers (without model details) */
modelRoutes.get("/providers", (c) => {
  const providers = getProviders();

  return c.json({
    success: true,
    data: providers.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      enabled: p.enabled,
      healthStatus: p.healthStatus,
      lastHealthCheck: p.lastHealthCheck,
      modelCount: p.models.length,
    })),
  } satisfies ApiResponse);
});
