/**
 * CLI Platforms API — Returns available CLI platforms and their capabilities.
 */

import { Hono } from "hono";
import { detectAllPlatforms, clearDetectionCache } from "../services/adapters/adapter-registry.js";

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
