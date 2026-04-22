export const DEFAULT_PORT = 3579;
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_PERMISSION_MODE = "bypassPermissions";
export const DB_PATH = "data/companion.db";
export const APP_VERSION = "0.27.0";

/** Max message length for Telegram */
export const TELEGRAM_MAX_LENGTH = 4096;

/** Default auto-approve countdown in seconds */
export const DEFAULT_AUTO_APPROVE_TIMEOUT = 30;

/** Plan mode watchdog timeout in ms (5 minutes) */
export const PLAN_MODE_WATCHDOG_MS = 5 * 60 * 1000;

/** Exit plan mode retry attempts */
export const EXIT_PLAN_MAX_RETRIES = 3;

/** Exit plan mode retry delay in ms */
export const EXIT_PLAN_RETRY_DELAY_MS = 2000;

/** Maximum number of concurrently active sessions */
export const MAX_ACTIVE_SESSIONS = 6;

/** Default idle timeout before auto-killing an API/web session (30 minutes) */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Defaults for per-session settings persisted on the `sessions` table.
 *
 * CRITICAL: these values MUST stay in lock-step with the column defaults
 * in `packages/server/src/db/migrations/0044_session_settings_unify.sql`
 * and the Drizzle schema in `packages/server/src/db/schema.ts`. Update
 * all three together — the migration has no way to reference TS constants.
 */
export const DEFAULT_IDLE_TIMEOUT_ENABLED = true;
export const DEFAULT_KEEP_ALIVE = false;
export const DEFAULT_AUTO_REINJECT_ON_COMPACT = true;
export const DEFAULT_THINKING_MODE = "adaptive" as const;
export const DEFAULT_CONTEXT_MODE = "200k" as const;
export const DEFAULT_COMPACT_MODE = "manual" as const;
export const DEFAULT_COMPACT_THRESHOLD = 75;

/** Process liveness check interval (60 seconds) */
export const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

// ── Feature definitions by tier ─────────────────────────────────────────────

export const FREE_FEATURES = [
  "web_terminal",
  "basic_commands",
  "multi_session",
  "telegram_bot",
  "magic_ring",
  "stream_bridge",
  "permission_gate_telegram",
  "templates",
  "desktop_app",
  "thinking_mode",
  "rtk_basic",
  "mcp_detect",
  "pulse_monitor",
  "inline_diff",
  "debate_free",
] as const;

export const PRO_FEATURES = [
  ...FREE_FEATURES,
  "shared_context",
  "rtk_pro",
  "codegraph",
  "codegraph_advanced",
  "domain_config",
  "letsencrypt_ssl",
  "multi_bot_telegram",
  "debate_multiplatform",
  "personas",
  "unlimited_sessions",
] as const;

export type Feature = (typeof PRO_FEATURES)[number];

// ── Tier configuration ──────────────────────────────────────────────────────

export const TIER_CONFIG = {
  free: { maxSessions: 2, features: FREE_FEATURES },
  trial: { maxSessions: -1, features: PRO_FEATURES },
  pro: { maxSessions: -1, features: PRO_FEATURES },
} as const;

/**
 * Native max context window tokens by model family.
 *
 * IMPORTANT: Claude Code CLI default is 200K for ALL models unless user
 * opts into 1M via the `[1m]` model suffix (e.g. `claude-opus-4-7[1m]`).
 * When `contextMode === "1m"` is passed, we return 1M ONLY for models
 * that support it. Other combinations fall back to 200K.
 */
export function getMaxContextTokens(model: string, contextMode: "200k" | "1m" = "200k"): number {
  if (contextMode === "1m" && modelSupports1M(model)) return 1_000_000;
  return 200_000;
}

/** Models that support the 1M context window (Opus 4.7, Opus 4.6, Sonnet 4.6). */
export function modelSupports1M(model: string): boolean {
  if (!model) return false;
  // Strip an existing [1m] suffix for detection
  const bare = model.replace(/\[1m\]$/i, "");
  if (bare.includes("haiku")) return false;
  if (bare.includes("opus") && (bare.includes("4-7") || bare.includes("4-6"))) return true;
  if (bare.includes("sonnet") && bare.includes("4-6")) return true;
  // Aliases "opus" / "sonnet" on Anthropic API default to 4.7 / 4.6 → both support 1M
  if (bare === "opus" || bare === "sonnet") return true;
  return false;
}

/**
 * Append the Claude Code `[1m]` context suffix when appropriate.
 * Safe for any model string — returns unchanged if model doesn't support 1M.
 */
export function applyContextSuffix(model: string, contextMode: "200k" | "1m" | undefined): string {
  if (!model) return model;
  if (contextMode !== "1m") return model;
  if (!modelSupports1M(model)) return model;
  if (/\[1m\]$/i.test(model)) return model;
  return `${model}[1m]`;
}
