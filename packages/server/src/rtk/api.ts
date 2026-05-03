/**
 * Public, agent-facing RTK API.
 *
 * Phase 2 of the harness layer wraps the internal pipeline with a tiny
 * surface: text in, compressed text out. Used by the `companion_compress`
 * MCP tool and by the auto-chain wrapper that compresses oversized tool
 * outputs before returning them to the agent.
 */

import { createDefaultPipeline, estimateTokens, type RTKPipeline } from "./index.js";
import { getSetting } from "../services/settings-helpers.js";
import { createLogger } from "../logger.js";

const log = createLogger("rtk-api");

let lazyPipeline: RTKPipeline | null = null;
function getPipeline(): RTKPipeline {
  if (!lazyPipeline) lazyPipeline = createDefaultPipeline();
  return lazyPipeline;
}

/** Default compression budget when caller omits one (matches plan). */
const DEFAULT_BUDGET_TOKENS = 2000;

/** Length of the truncation suffix appended in hard-truncate fallback. */
const TRUNCATION_SUFFIX = "\n…[truncated to fit budget]";

/** Threshold above which auto-chain triggers a compress pass. */
export const HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD = 4000;

export interface CompressOptions {
  /** Cap output to this many tokens. Default 2000. */
  budgetTokens?: number;
  /** Session id for pipeline cache. Optional. */
  sessionId?: string;
  /** Tool name (for context-sensitive strategies, e.g. error vs info). */
  toolName?: string;
}

export interface CompressResult {
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  /** compressedTokens / originalTokens (1.0 = no savings) */
  ratio: number;
  /** Names of strategies that fired. */
  strategiesApplied: string[];
}

/**
 * Compress a free-form text blob using the configured RTK pipeline,
 * with an extra hard cap at `budgetTokens` if the pipeline's own
 * compression isn't aggressive enough.
 */
export function compressText(text: string, opts: CompressOptions = {}): CompressResult {
  const budgetTokens = opts.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const originalTokens = estimateTokens(text);

  if (originalTokens <= budgetTokens) {
    // Already within budget — return verbatim, skip pipeline overhead.
    return {
      compressed: text,
      originalTokens,
      compressedTokens: originalTokens,
      ratio: 1,
      strategiesApplied: [],
    };
  }

  const pipeline = getPipeline();
  // Default sessionId left undefined → bypass RTK's per-session cache.
  // A shared synthetic id (e.g. "harness-compress") would pool every
  // caller's outputs into one cache key and serve cross-session
  // hits for matching input text. Caller MUST pass a real sessionId
  // when they actually want caching.
  const result = pipeline.transform(text, {
    sessionId: opts.sessionId ?? "",
    toolName: opts.toolName,
  });

  let compressed = result.compressed;
  const strategiesApplied = [...result.savings.strategiesApplied];

  // Hard cap: if pipeline output is still over budget, truncate by chars.
  // Reserve room for the truncation suffix so the final estimateTokens()
  // stays at or under budgetTokens.
  const budgetChars = budgetTokens * 4;
  if (compressed.length > budgetChars) {
    const sliceLen = Math.max(0, budgetChars - TRUNCATION_SUFFIX.length);
    compressed = compressed.slice(0, sliceLen) + TRUNCATION_SUFFIX;
    strategiesApplied.push("hard-truncate");
  }

  const compressedTokens = estimateTokens(compressed);
  return {
    compressed,
    originalTokens,
    compressedTokens,
    ratio: originalTokens > 0 ? compressedTokens / originalTokens : 1,
    strategiesApplied,
  };
}

/**
 * Auto-chain config — read from `settings` DB with safe defaults.
 * Cached for 30 seconds inside the same process so we don't hit the
 * DB on every tool call.
 */
interface AutoChainConfig {
  enabled: boolean;
  thresholdTokens: number;
}

const CACHE_TTL_MS = 30_000;
let cachedConfig: { value: AutoChainConfig; expiresAt: number } | null = null;

export function getAutoCompressConfig(): AutoChainConfig {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) return cachedConfig.value;

  let enabled = true;
  let thresholdTokens = HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD;
  try {
    const enabledSetting = getSetting("harness.autoCompressEnabled");
    if (enabledSetting === "false" || enabledSetting === "0") enabled = false;
    const thresholdSetting = getSetting("harness.autoCompressThreshold");
    if (thresholdSetting) {
      const parsed = Number.parseInt(thresholdSetting, 10);
      if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 32_000) {
        thresholdTokens = parsed;
      }
    }
  } catch (err) {
    log.debug("Failed to read auto-compress settings", { error: String(err) });
  }

  const value: AutoChainConfig = { enabled, thresholdTokens };
  cachedConfig = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Test helper: reset the cached config so tests see fresh setting reads. */
export function resetAutoCompressConfigCache(): void {
  cachedConfig = null;
}
