/**
 * CLI Platforms API — Returns available CLI platforms and their capabilities.
 */

import { Hono } from "hono";
import { detectAllPlatforms, clearDetectionCache, listPlatformModels } from "../services/adapters/adapter-registry.js";

const app = new Hono();

/** GET /api/cli-platforms — List all CLI platforms with detection status */
app.get("/", async (c) => {
  const results = await detectAllPlatforms();

  const platforms = results.map(({ platform, adapter, detection }) => ({
    id: platform,
    name:
      platform === "claude"
        ? "Claude Code"
        : platform === "codex"
          ? "Codex"
          : platform === "gemini"
            ? "Gemini CLI"
            : platform === "opencode"
              ? "OpenCode"
              : platform,
    available: detection.available,
    version: detection.version,
    path: detection.path,
    capabilities: adapter.capabilities,
  }));

  return c.json({ platforms });
});

/** GET /api/cli-platforms/models — List available models for all platforms */
app.get("/models", async (c) => {
  const platformId = c.req.query("platform");
  const KNOWN_PLATFORMS = new Set(["claude", "codex", "gemini", "opencode"]);

  if (platformId) {
    if (!KNOWN_PLATFORMS.has(platformId)) {
      return c.json({ models: [], platform: platformId, error: "Unknown platform" }, 400);
    }
    const raw = await listPlatformModels(platformId as "claude" | "codex" | "gemini" | "opencode");
    const models = raw.map((m) => ({ value: m.id, label: m.name }));
    return c.json({ models, platform: platformId });
  }

  const results = await detectAllPlatforms();
  const modelsByPlatform: Record<string, Array<{ value: string; label: string }>> = {};

  await Promise.all(
    results.map(async ({ platform, detection }) => {
      if (detection.available) {
        const models = await listPlatformModels(platform);
        modelsByPlatform[platform] = models.map((m) => ({
          value: m.id,
          label: m.name,
        }));
      }
    }),
  );

  return c.json({ models: modelsByPlatform });
});

/** POST /api/cli-platforms/refresh — Clear detection cache and re-detect */
app.post("/refresh", async (c) => {
  clearDetectionCache();
  const results = await detectAllPlatforms();

  const platforms = results.map(({ platform, detection }) => ({
    id: platform,
    available: detection.available,
    version: detection.version,
  }));

  return c.json({ platforms, refreshed: true });
});

export default app;
