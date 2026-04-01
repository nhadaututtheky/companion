/**
 * CLILauncher — Spawns Claude Code CLI processes with NDJSON pipe.
 * Includes plan mode fix: retry + escalation + watchdog.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import {
  PLAN_MODE_WATCHDOG_MS,
  EXIT_PLAN_MAX_RETRIES,
  EXIT_PLAN_RETRY_DELAY_MS,
} from "@companion/shared";
import type { HooksSettings } from "@companion/shared";

const log = createLogger("cli-launcher");

export interface LaunchOptions {
  sessionId: string;
  cwd: string;
  model: string;
  permissionMode?: string;
  prompt?: string;
  resume?: boolean;
  cliSessionId?: string;
  envVars?: Record<string, string>;
  /** Companion hook endpoint URL — injected into project settings for CLI */
  hooksUrl?: string;
  /** Bare mode — minimal output, no thinking/verbose. For cost-sensitive sessions. */
  bare?: boolean;
}

export interface LaunchResult {
  pid: number;
  /** Write NDJSON to CLI stdin */
  send: (data: string) => void;
  /** Kill the CLI process */
  kill: () => void;
  /** Promise that resolves when process exits */
  exited: Promise<number>;
  /** Check if the process is still alive (exitCode === null) */
  isAlive: () => boolean;
  /** Get last N lines from stderr (for error diagnostics) */
  getStderrLines: () => string[];
}

/**
 * Resolve the correct Claude Code CLI binary.
 * On Windows, Bun.spawn doesn't handle .cmd shims — use the .js entrypoint directly.
 */
function resolveClaudeBinary(): string {
  const platform = process.platform;

  if (platform === "win32") {
    // Try direct path to Claude Code's Node.js entrypoint
    const appData = process.env.APPDATA;
    if (appData) {
      // Check multiple possible locations and filenames
      const candidates = [
        `${appData}/npm/node_modules/@anthropic-ai/claude-code/cli.js`,
        `${appData}/npm/node_modules/@anthropic-ai/claude-code/cli.mjs`,
        `${appData}/npm/node_modules/@anthropic-ai/claude-code/dist/cli.js`,
        `${appData}/npm/node_modules/@anthropic-ai/claude-code/dist/cli.mjs`,
      ];

      for (const path of candidates) {
        try {
          if (Bun.file(path).size) {
            log.info("Resolved Claude binary", { path });
            return path;
          }
        } catch {
          // file doesn't exist
        }
      }

      log.warn("Could not find Claude CLI entrypoint in APPDATA, trying global npm");
    }

    // Try finding the .cmd shim path
    const npmGlobal = process.env.npm_config_prefix ?? `${appData}/npm`;
    const cmdPath = `${npmGlobal}/claude.cmd`;
    try {
      if (Bun.file(cmdPath).size) {
        log.info("Resolved Claude .cmd shim", { path: cmdPath });
        return cmdPath;
      }
    } catch {
      // not found
    }

    // Fallback: use claude command (shell will find .cmd shim)
    log.warn("Falling back to 'claude' in PATH — may fail with Bun.spawn on Windows");
    return "claude";
  }

  return "claude";
}

/**
 * Build clean environment for the CLI process.
 * Inherits the full parent env (so Docker/WSL PATH, locale, etc. all work)
 * and only strips Companion-internal vars that could confuse the child.
 */
function buildCleanEnv(extra?: Record<string, string>): Record<string, string> {
  // Start from full parent env — avoids the whitelist trap where
  // Docker/WSL users lose PATH entries and sessions die on start.
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Strip Companion-internal vars that would confuse the CLI child
  const stripPrefixes = ["COMPANION_", "CLAUDE_CODE_"];
  const stripExact = new Set(["CLAUDECODE", "PORT", "HOST"]);

  for (const key of Object.keys(env)) {
    if (stripExact.has(key) || stripPrefixes.some((p) => key.startsWith(p))) {
      delete env[key];
    }
  }

  // Merge project-specific env vars (overrides)
  if (extra) {
    Object.assign(env, extra);
  }

  return env;
}

/**
 * Inject Companion hooks config into project-level .claude/settings.local.json.
 * Claude Code reads this file for project-specific overrides.
 * Returns a cleanup function that removes the injected hooks on session exit.
 */
function injectHooksConfig(cwd: string, hooksUrl: string, sessionId: string): () => void {
  const claudeDir = join(cwd, ".claude");
  const settingsPath = join(claudeDir, "settings.local.json");

  // Read existing settings if present
  let existing: Record<string, unknown> = {};
  try {
    if (existsSync(settingsPath)) {
      existing = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    }
  } catch {
    // Corrupt or unreadable — start fresh
  }

  // Save original hooks for restoration
  const originalHooks = existing.hooks as Record<string, unknown> | undefined;

  // Build hooks config pointing to Companion's hook receiver
  const hookUrl = `${hooksUrl}/${sessionId}`;
  const companionHook = { type: "http" as const, url: hookUrl };
  const hooks: HooksSettings = {
    PreToolUse: [companionHook],
    PostToolUse: [companionHook],
    Stop: [companionHook],
    Notification: [companionHook],
  };

  // Merge with existing settings (preserve everything else)
  const merged = { ...existing, hooks };

  // Ensure .claude dir exists
  mkdirSync(claudeDir, { recursive: true });

  // Write settings
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2), "utf-8");
  log.info("Injected hooks config", { settingsPath, hookUrl });

  // Return cleanup function
  return () => {
    try {
      if (originalHooks !== undefined) {
        // Restore original hooks
        const current = existsSync(settingsPath)
          ? JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>
          : {};
        const restored = { ...current, hooks: originalHooks };
        writeFileSync(settingsPath, JSON.stringify(restored, null, 2), "utf-8");
      } else {
        // Remove hooks key entirely
        if (existsSync(settingsPath)) {
          const current = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
          delete current.hooks;
          if (Object.keys(current).length === 0) {
            unlinkSync(settingsPath);
          } else {
            writeFileSync(settingsPath, JSON.stringify(current, null, 2), "utf-8");
          }
        }
      }
      log.debug("Cleaned up hooks config", { settingsPath });
    } catch (err) {
      log.warn("Failed to clean up hooks config", { error: String(err) });
    }
  };
}

/**
 * Launch a Claude Code CLI session with NDJSON piped I/O.
 */
export function launchCLI(
  opts: LaunchOptions,
  onMessage: (data: string) => void,
  onExit: (code: number) => void,
): LaunchResult {
  const binary = resolveClaudeBinary();

  const args: string[] = [
    "--print",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--model", opts.model,
  ];

  // Bare mode: minimal output for cost-sensitive sessions
  if (opts.bare) {
    args.push("--bare");
  }

  if (opts.permissionMode) {
    args.push("--permission-mode", opts.permissionMode);
  }

  if (opts.resume && opts.cliSessionId) {
    args.push("--resume", opts.cliSessionId);
    // Replay user messages for better context restoration on resume
    args.push("--replay-user-messages");
  }
  // NOTE: Do NOT use --prompt flag — it runs single-turn mode and CLI exits after response.
  // Instead, send the initial prompt via stdin NDJSON after CLI starts (interactive mode).

  // Inject hooks config into project-level settings if hooksUrl is provided
  let hooksCleanup: (() => void) | undefined;
  if (opts.hooksUrl) {
    hooksCleanup = injectHooksConfig(opts.cwd, opts.hooksUrl, opts.sessionId);
  }

  log.info("Launching CLI", {
    binary,
    cwd: opts.cwd,
    model: opts.model,
    sessionId: opts.sessionId,
    resume: opts.resume,
    hooks: !!opts.hooksUrl,
  });

  const env = buildCleanEnv(opts.envVars);

  // Determine how to spawn based on binary type
  let spawnCmd: string[];
  if (binary.endsWith(".js") || binary.endsWith(".mjs")) {
    // Direct Node.js entrypoint — run with node
    spawnCmd = ["node", binary, ...args];
  } else if (binary.endsWith(".cmd") || binary.endsWith(".bat")) {
    // Windows .cmd shim — run via cmd.exe
    spawnCmd = ["cmd", "/c", binary, ...args];
  } else {
    spawnCmd = [binary, ...args];
  }

  // Note: CLAUDECODE and CLAUDE_CODE_* are already stripped by buildCleanEnv()

  log.info("Spawning CLI", { cmd: spawnCmd[0], args: spawnCmd.slice(1, 5).join(" ") + "..." });

  const proc = Bun.spawn(spawnCmd, {
    cwd: opts.cwd,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const pid = proc.pid;
  log.info("CLI process started", { pid, sessionId: opts.sessionId });

  // Circular buffer for last N stderr lines (for error diagnostics)
  const stderrLines: string[] = [];
  const MAX_STDERR_LINES = 20;

  // Read stdout as NDJSON lines
  const readStream = async (stream: ReadableStream<Uint8Array> | null, label: string) => {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (label === "stdout") {
            onMessage(trimmed);
          } else {
            log.debug("CLI stderr", { line: trimmed.slice(0, 200) });
            stderrLines.push(trimmed.slice(0, 300));
            if (stderrLines.length > MAX_STDERR_LINES) {
              stderrLines.shift();
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        if (label === "stdout") {
          onMessage(buffer.trim());
        } else {
          stderrLines.push(buffer.trim().slice(0, 300));
          if (stderrLines.length > MAX_STDERR_LINES) {
            stderrLines.shift();
          }
        }
      }
    } catch (err) {
      log.error(`Error reading CLI ${label}`, { error: String(err) });
    }
  };

  // Start reading stdout and stderr
  readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
  readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

  // Track process exit
  const exited = proc.exited.then((code) => {
    log.info("CLI process exited", { pid, code, sessionId: opts.sessionId });
    // Clean up injected hooks config
    hooksCleanup?.();
    onExit(code);
    return code;
  });

  const send = (data: string) => {
    try {
      proc.stdin.write(data.endsWith("\n") ? data : data + "\n");
      proc.stdin.flush();
    } catch (err) {
      log.error("Failed to write to CLI stdin", { error: String(err) });
    }
  };

  const kill = () => {
    try {
      proc.kill();
    } catch {
      // already dead
    }
  };

  // Early exit detection — if process dies within 2s, something is wrong
  setTimeout(() => {
    try {
      // Check if process is still alive
      if (proc.exitCode !== null) {
        log.warn("CLI process exited early", {
          pid,
          code: proc.exitCode,
          sessionId: opts.sessionId,
        });
      }
    } catch {
      // ignore
    }
  }, 2000);

  const isAlive = () => {
    try {
      return proc.exitCode === null;
    } catch {
      return false;
    }
  };

  const getStderrLines = () => [...stderrLines];

  return { pid, send, kill, exited, isAlive, getStderrLines };
}

// ─── Plan Mode Stuck Fix ────────────────────────────────────────────────────

export interface PlanModeWatcher {
  /** Start watching for plan mode stuck */
  start: () => void;
  /** Stop watching */
  stop: () => void;
  /** Notify that plan mode was entered */
  onEnterPlan: () => void;
  /** Notify that plan mode was exited */
  onExitPlan: () => void;
}

/**
 * Create a plan mode watchdog that detects stuck plan mode
 * and escalates through retry → SIGINT → force kill.
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
        // Layer 1: Retry ExitPlanMode
        log.warn("Plan mode stuck — retrying exit", { attempt: retryCount });
        onStuck("retry");
        exitPlanRequest();

        // Re-arm watchdog with shorter timeout for retries
        setTimeout(() => {
          if (isInPlanMode) startWatchdog();
        }, EXIT_PLAN_RETRY_DELAY_MS);
      } else {
        // Layer 2: Send interrupt (SIGINT equivalent)
        log.warn("Plan mode stuck after retries — sending interrupt");
        onStuck("interrupt");

        const ndjson = JSON.stringify({
          type: "control_request",
          request: { subtype: "interrupt" },
        });
        sendToCLI(ndjson);

        // Layer 3: If still stuck after 30s, escalate to kill
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
