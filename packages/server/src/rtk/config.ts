/**
 * RTK Configuration
 *
 * Reads RTK settings from DB settings table.
 * Settings keys:
 *   rtk.enabled       — "true"/"false" (default: true)
 *   rtk.level         — "aggressive"/"balanced"/"minimal"/"unlimited" (default: balanced)
 *   rtk.disabled      — comma-separated strategy names to skip (default: "")
 */

import { getSetting } from "../services/settings-helpers.js";
import type { RTKLevel } from "./budget.js";

export interface RTKConfig {
  enabled: boolean;
  level: RTKLevel;
  disabledStrategies: Set<string>;
}

const VALID_LEVELS: RTKLevel[] = ["aggressive", "balanced", "minimal", "unlimited"];

/**
 * Load RTK configuration from DB settings.
 * Falls back to sensible defaults if not configured.
 */
export function getRTKConfig(): RTKConfig {
  const enabled = getSetting("rtk.enabled");
  const level = getSetting("rtk.level") as RTKLevel | undefined;
  const disabled = getSetting("rtk.disabled");

  return {
    enabled: enabled !== "false", // default true
    level: level && VALID_LEVELS.includes(level) ? level : "balanced",
    disabledStrategies: disabled
      ? new Set(disabled.split(",").map((s) => s.trim()).filter(Boolean))
      : new Set(),
  };
}

/** All valid RTK levels for settings UI */
export const RTK_LEVELS = VALID_LEVELS;

/** All available strategy names (for settings UI) */
export const RTK_STRATEGY_NAMES = [
  "ansi-strip",
  "boilerplate",
  "stack-trace",
  "error-aggregate",
  "test-summary",
  "diff-summary",
  "json-limiter",
  "blank-collapse",
  "dedup",
  "truncate",
] as const;
