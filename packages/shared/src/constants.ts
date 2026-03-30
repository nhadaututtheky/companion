export const DEFAULT_PORT = 3579;
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const DEFAULT_PERMISSION_MODE = "default";
export const DB_PATH = "data/companion.db";
export const APP_VERSION = "0.1.0";

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

/** Process liveness check interval (60 seconds) */
export const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

/** Max context window tokens by model family */
export function getMaxContextTokens(model: string): number {
  if (model.includes("haiku")) return 200_000;
  // opus + sonnet both have 1M context
  return 1_000_000;
}
