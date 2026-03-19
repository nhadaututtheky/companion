/**
 * CLILauncher — Spawns Claude Code CLI processes with NDJSON pipe.
 * Includes plan mode fix: retry + escalation + watchdog.
 */

import { createLogger } from "../logger.js";
import {
  PLAN_MODE_WATCHDOG_MS,
  EXIT_PLAN_MAX_RETRIES,
  EXIT_PLAN_RETRY_DELAY_MS,
} from "@companion/shared";

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
}

/**
 * Resolve the correct Claude Code CLI binary.
 * On Windows, Bun.spawn doesn't handle .cmd shims — use the .js entrypoint directly.
 */
function resolveClaudeBinary(): string {
  const platform = process.platform;

  if (platform === "win32") {
    // Try direct path to Claude Code's Node.js entrypoint
    // Newer versions use cli.js, older used cli.mjs
    const appData = process.env.APPDATA;
    if (appData) {
      for (const filename of ["cli.js", "cli.mjs"]) {
        const path = `${appData}/npm/node_modules/@anthropic-ai/claude-code/${filename}`;
        try {
          if (Bun.file(path).size) {
            log.info("Resolved Claude binary", { path });
            return path;
          }
        } catch {
          // file doesn't exist
        }
      }
    }

    // Fallback: use claude command (shell will find .cmd shim)
    return "claude";
  }

  return "claude";
}

/**
 * Build clean environment for the CLI process.
 * Strip out any Companion-specific env vars that could interfere.
 */
function buildCleanEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  // Copy essential env vars
  const passthrough = [
    "PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    "SystemRoot", "SYSTEMROOT", "COMSPEC", "TEMP", "TMP",
    "ANTHROPIC_API_KEY", "CLAUDE_API_KEY",
    "NODE_ENV", "BUN_ENV",
  ];

  for (const key of passthrough) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
    }
  }

  // Merge project-specific env vars
  if (extra) {
    Object.assign(env, extra);
  }

  return env;
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

  if (opts.permissionMode) {
    args.push("--permission-mode", opts.permissionMode);
  }

  if (opts.resume && opts.cliSessionId) {
    args.push("--resume", opts.cliSessionId);
  }
  // NOTE: Do NOT use --prompt flag — it runs single-turn mode and CLI exits after response.
  // Instead, send the initial prompt via stdin NDJSON after CLI starts (interactive mode).

  log.info("Launching CLI", {
    binary,
    cwd: opts.cwd,
    model: opts.model,
    sessionId: opts.sessionId,
    resume: opts.resume,
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

  // Strip CLAUDECODE env to prevent nested session rejection
  delete env.CLAUDECODE;
  for (const key of Object.keys(env)) {
    if (key.startsWith("CLAUDE_CODE_")) {
      delete env[key];
    }
  }

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
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        if (label === "stdout") {
          onMessage(buffer.trim());
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

  return { pid, send, kill, exited, isAlive };
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
