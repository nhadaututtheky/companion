/**
 * CLILauncher — Spawns AI coding CLI processes via adapter registry.
 * Supports Claude Code, Codex, Gemini CLI, OpenCode.
 * Includes plan mode fix: retry + escalation + watchdog.
 */

import { createLogger } from "../logger.js";
import {
  PLAN_MODE_WATCHDOG_MS,
  EXIT_PLAN_MAX_RETRIES,
  EXIT_PLAN_RETRY_DELAY_MS,
} from "@companion/shared";
import type { CLIPlatform, CLIProcess, AdapterLaunchOptions, NormalizedMessage } from "@companion/shared";
import { getAdapter } from "./adapters/adapter-registry.js";

const log = createLogger("cli-launcher");

// Re-export types for backward compatibility
export type { CLIProcess as LaunchResult } from "@companion/shared";

export interface LaunchOptions {
  sessionId: string;
  cwd: string;
  model: string;
  permissionMode?: string;
  prompt?: string;
  resume?: boolean;
  cliSessionId?: string;
  envVars?: Record<string, string>;
  hooksUrl?: string;
  hookSecret?: string;
  bare?: boolean;
  thinkingBudget?: number;
  /** CLI platform to use (default: "claude") */
  cliPlatform?: CLIPlatform;
  /** Platform-specific options */
  platformOptions?: Record<string, unknown>;
}

/**
 * Launch a CLI session using the appropriate adapter.
 * This is the main entry point — ws-bridge.ts calls this.
 */
export async function launchCLI(
  opts: LaunchOptions,
  onMessage: (msg: NormalizedMessage) => void,
  onExit: (code: number) => void,
): Promise<CLIProcess> {
  const platform = opts.cliPlatform ?? "claude";
  const adapter = getAdapter(platform);

  log.info("Launching CLI via adapter", {
    platform,
    sessionId: opts.sessionId,
    model: opts.model,
    cwd: opts.cwd,
  });

  const adapterOpts: AdapterLaunchOptions = {
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    model: opts.model,
    prompt: opts.prompt,
    resume: opts.resume,
    cliSessionId: opts.cliSessionId,
    permissionMode: opts.permissionMode,
    thinkingBudget: opts.thinkingBudget,
    envVars: opts.envVars,
    platformOptions: opts.platformOptions,
    // Claude-specific passthrough
    hooksUrl: opts.hooksUrl,
    hookSecret: opts.hookSecret,
    bare: opts.bare,
  };

  return adapter.launch(adapterOpts, onMessage, onExit);
}

/**
 * Format a user message for the given platform's stdin protocol.
 */
export function formatUserMessage(content: string, platform: CLIPlatform = "claude"): string {
  const adapter = getAdapter(platform);
  return adapter.formatUserMessage(content);
}

// ─── Plan Mode Stuck Fix ────────────────────────────────────────────────────

export interface PlanModeWatcher {
  start: () => void;
  stop: () => void;
  onEnterPlan: () => void;
  onExitPlan: () => void;
}

/**
 * Create a plan mode watchdog that detects stuck plan mode
 * and escalates through retry → SIGINT → force kill.
 * Note: Plan mode is Claude-specific, but the watchdog is generic enough
 * to use with any platform that might get stuck.
 */
export function createPlanModeWatcher(
  sendToCLI: (ndjson: string) => void,
  onStuck: (action: "retry" | "interrupt" | "kill") => void,
): PlanModeWatcher {
  let isInPlanMode = false;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  const clearWatchdog = () => {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  };

  const exitPlanRequest = () => {
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content: "/exitplan" },
    });
    sendToCLI(ndjson);
  };

  const startWatchdog = () => {
    clearWatchdog();

    watchdogTimer = setTimeout(() => {
      if (!isInPlanMode) return;

      retryCount++;

      if (retryCount <= EXIT_PLAN_MAX_RETRIES) {
        log.warn("Plan mode stuck — retrying exit", { attempt: retryCount });
        onStuck("retry");
        exitPlanRequest();

        setTimeout(() => {
          if (isInPlanMode) startWatchdog();
        }, EXIT_PLAN_RETRY_DELAY_MS);
      } else {
        log.warn("Plan mode stuck after retries — sending interrupt");
        onStuck("interrupt");

        const ndjson = JSON.stringify({
          type: "control_request",
          request: { subtype: "interrupt" },
        });
        sendToCLI(ndjson);

        setTimeout(() => {
          if (isInPlanMode) {
            log.error("Plan mode still stuck after interrupt — recommend kill");
            onStuck("kill");
          }
        }, 30_000);
      }
    }, PLAN_MODE_WATCHDOG_MS);
  };

  return {
    start: () => {
      log.info("Plan mode watcher started");
    },
    stop: () => {
      clearWatchdog();
      isInPlanMode = false;
      retryCount = 0;
    },
    onEnterPlan: () => {
      isInPlanMode = true;
      retryCount = 0;
      startWatchdog();
      log.info("Plan mode entered — watchdog armed");
    },
    onExitPlan: () => {
      isInPlanMode = false;
      retryCount = 0;
      clearWatchdog();
      log.info("Plan mode exited — watchdog disarmed");
    },
  };
}
