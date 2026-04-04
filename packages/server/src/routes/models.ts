/**
 * Models API — Returns available AI models grouped by provider.
 *
 * GET /api/models — list all available models (free + configured)
 * GET /api/models/health — check which providers are reachable
 * POST /api/models/providers/:id/toggle — enable/disable a provider
 */

import { Hono } from "hono";
import {
  getModelsGrouped,
  checkProvidersHealth,
  invalidateCache,
  getProviders,
} from "../services/provider-registry.js";
import { getSetting } from "../services/settings-helpers.js";
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
modelRoutes.post("/providers/:id/toggle", async (c) => {
  const providerId = c.req.param("id");
  const body = await c.req.json<{ enabled: boolean }>().catch(() => null);

  if (body === null || typeof body.enabled !== "boolean") {
    return c.json(
      { success: false, error: "Body must include { enabled: boolean }" } satisfies ApiResponse,
      400,
    );
  }

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
