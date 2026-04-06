/**
 * Adapter Registry — Maps CLI platform IDs to adapter instances.
 * Provides platform detection and adapter resolution.
 */

import { createLogger } from "../../logger.js";
import type { CLIAdapter, CLIPlatform, CLIDetectResult } from "@companion/shared";
import { ClaudeAdapter } from "./claude-adapter.js";

const log = createLogger("adapter-registry");

/** Cached detection results */
const detectionCache = new Map<CLIPlatform, CLIDetectResult>();

/** Registered adapter instances (singletons) */
const adapters = new Map<CLIPlatform, CLIAdapter>();

/** Register built-in adapters */
function ensureRegistered(): void {
  if (adapters.size > 0) return;
  adapters.set("claude", new ClaudeAdapter());
  // Future: adapters.set("codex", new CodexAdapter());
  // Future: adapters.set("gemini", new GeminiAdapter());
  // Future: adapters.set("opencode", new OpenCodeAdapter());
}

/**
 * Get an adapter by platform ID.
 * Throws if platform is not registered.
 */
export function getAdapter(platform: CLIPlatform): CLIAdapter {
  ensureRegistered();
  const adapter = adapters.get(platform);
  if (!adapter) {
    throw new Error(`No adapter registered for platform: ${platform}`);
  }
  return adapter;
}

/**
 * Get all registered adapters.
 */
export function getAllAdapters(): CLIAdapter[] {
  ensureRegistered();
  return Array.from(adapters.values());
}

/**
 * Detect which CLI platforms are available on this system.
 * Results are cached — call clearDetectionCache() to refresh.
 */
export async function detectAllPlatforms(): Promise<
  Array<{ platform: CLIPlatform; adapter: CLIAdapter; detection: CLIDetectResult }>
> {
  ensureRegistered();

  const results = await Promise.all(
    Array.from(adapters.entries()).map(async ([platform, adapter]) => {
      // Use cache if available
      if (detectionCache.has(platform)) {
        return { platform, adapter, detection: detectionCache.get(platform)! };
      }

      try {
        const detection = await adapter.detect();
        detectionCache.set(platform, detection);
        log.info("Platform detected", { platform, available: detection.available, version: detection.version });
        return { platform, adapter, detection };
      } catch (err) {
        const detection: CLIDetectResult = { available: false };
        detectionCache.set(platform, detection);
        log.warn("Platform detection failed", { platform, error: String(err) });
        return { platform, adapter, detection };
      }
    }),
  );

  return results;
}

/**
 * Detect a single platform (with cache).
 */
export async function detectPlatform(platform: CLIPlatform): Promise<CLIDetectResult> {
  ensureRegistered();

  if (detectionCache.has(platform)) {
    return detectionCache.get(platform)!;
  }

  const adapter = adapters.get(platform);
  if (!adapter) {
    return { available: false };
  }

  try {
    const result = await adapter.detect();
    detectionCache.set(platform, result);
    return result;
  } catch {
    const result: CLIDetectResult = { available: false };
    detectionCache.set(platform, result);
    return result;
  }
}

/**
 * Clear the detection cache — forces re-detection on next call.
 */
export function clearDetectionCache(): void {
  detectionCache.clear();
}

/**
 * Register a custom adapter (for plugins or testing).
 */
export function registerAdapter(platform: CLIPlatform, adapter: CLIAdapter): void {
  adapters.set(platform, adapter);
  detectionCache.delete(platform);
  log.info("Adapter registered", { platform });
}
