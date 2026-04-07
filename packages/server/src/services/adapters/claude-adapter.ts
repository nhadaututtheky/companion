/**
 * Claude Code CLI Adapter — Wraps the Claude Code CLI as a CLIAdapter.
 * Extracted from cli-launcher.ts for multi-CLI platform support.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../logger.js";
import type {
  CLIAdapter,
  CLICapabilities,
  CLIDetectResult,
  CLIProcess,
  AdapterLaunchOptions,
  NormalizedMessage,
  ContentBlockNorm,
} from "@companion/shared";
import type {
  CLIMessage,
  CLISystemInitMessage,
  CLIAssistantMessage,
  CLIResultMessage,
  CLIStreamEventMessage,
  CLIToolProgressMessage,
  CLIControlRequestMessage,
  HooksSettings,
} from "@companion/shared";

const log = createLogger("claude-adapter");

// ─── Claude Binary Resolution ───────────────────────────────────────────────

function resolveClaudeBinary(): string {
  const platform = process.platform;

  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
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

    log.warn("Falling back to 'claude' in PATH");
    return "claude";
  }

  return "claude";
}

// ─── Environment Builder ────────────────────────────────────────────────────

function buildCleanEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  const stripPrefixes = ["COMPANION_", "CLAUDE_CODE_"];
  const stripExact = new Set(["CLAUDECODE", "PORT", "HOST"]);

  for (const key of Object.keys(env)) {
    if (stripExact.has(key) || stripPrefixes.some((p) => key.startsWith(p))) {
      delete env[key];
    }
  }

  if (extra) {
    Object.assign(env, extra);
  }

  return env;
}

// ─── Hooks Injection ────────────────────────────────────────────────────────

/**
 * Track all injected hook paths so we can cleanup on server shutdown/startup.
 * Key = settingsPath, Value = cleanup function.
 */
const activeHookPaths = new Map<string, () => void>();

/**
 * Cleanup all injected hooks from active sessions — called on server shutdown.
 */
export function cleanupAllHooks(): void {
  for (const [path, cleanup] of activeHookPaths) {
    try {
      cleanup();
      log.info("Cleaned up hooks", { path });
    } catch {
      // best-effort
    }
  }
  activeHookPaths.clear();
}

/**
 * Cleanup orphan hooks from previous server runs — called on startup.
 * Scans given project dirs for .claude/settings.local.json containing
 * Companion hook URLs and removes them.
 */
export function cleanupOrphanHooks(projectDirs: string[]): number {
  let cleaned = 0;
  for (const dir of projectDirs) {
    const settingsPath = join(dir, ".claude", "settings.local.json");
    try {
      if (!existsSync(settingsPath)) continue;
      const raw = readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const hooks = settings.hooks as Record<string, unknown> | undefined;
      if (!hooks) continue;

      // Check if hooks contain Companion URLs (any hook pointing to /api/hooks/)
      const hooksJson = JSON.stringify(hooks);
      if (!hooksJson.includes("/api/hooks/")) continue;

      // Remove hooks
      delete settings.hooks;
      if (Object.keys(settings).length === 0) {
        unlinkSync(settingsPath);
      } else {
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      }
      cleaned++;
      log.info("Cleaned orphan hooks from previous session", { settingsPath });
    } catch {
      // skip files we can't read/write
    }
  }
  return cleaned;
}

function injectHooksConfig(
  cwd: string,
  hooksUrl: string,
  sessionId: string,
  hookSecret: string,
): () => void {
  const claudeDir = join(cwd, ".claude");
  const settingsPath = join(claudeDir, "settings.local.json");

  let existing: Record<string, unknown> = {};
  try {
    if (existsSync(settingsPath)) {
      existing = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    }
  } catch {
    // start fresh
  }

  const originalHooks = existing.hooks as Record<string, unknown> | undefined;

  const hookUrl = `${hooksUrl}/${sessionId}/${hookSecret}`;
  const companionHook = { type: "http" as const, url: hookUrl };
  const hooks: HooksSettings = {
    PreToolUse: [companionHook],
    PostToolUse: [companionHook],
    Stop: [companionHook],
    Notification: [companionHook],
  };

  const merged = { ...existing, hooks };
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2), "utf-8");
  log.info("Injected hooks config", { settingsPath, hookUrl });

  const cleanup = () => {
    try {
      if (originalHooks !== undefined) {
        const current = existsSync(settingsPath)
          ? (JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>)
          : {};
        const restored = { ...current, hooks: originalHooks };
        writeFileSync(settingsPath, JSON.stringify(restored, null, 2), "utf-8");
      } else {
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
      activeHookPaths.delete(settingsPath);
      log.debug("Cleaned up hooks config", { settingsPath });
    } catch (err) {
      log.warn("Failed to clean up hooks config", { error: String(err) });
    }
  };

  activeHookPaths.set(settingsPath, cleanup);
  return cleanup;
}

// ─── NDJSON → NormalizedMessage Parser ──────────────────────────────────────

function parseClaudeMessage(line: string): NormalizedMessage | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const msg = parsed as CLIMessage;

  switch (msg.type) {
    case "system": {
      if ("subtype" in msg && msg.subtype === "init") {
        const init = msg as CLISystemInitMessage;
        return {
          type: "system_init",
          platform: "claude",
          sessionId: init.session_id,
          cwd: init.cwd,
          tools: init.tools,
          model: init.model,
          cliVersion: init.claude_code_version,
          permissionMode: init.permissionMode,
          raw: msg,
        };
      }
      if ("subtype" in msg && msg.subtype === "status") {
        return {
          type: "status",
          platform: "claude",
          status: (msg as { status: "compacting" | null }).status,
          raw: msg,
        };
      }
      return null;
    }

    case "assistant": {
      const assist = msg as CLIAssistantMessage;
      const blocks: ContentBlockNorm[] = assist.message.content.map((b) => {
        if (b.type === "text") return { type: "text" as const, text: b.text };
        if (b.type === "tool_use") return { type: "tool_use" as const, id: b.id, name: b.name, input: b.input };
        if (b.type === "tool_result") return {
          type: "tool_result" as const,
          tool_use_id: b.tool_use_id,
          content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
          is_error: b.is_error,
        };
        if (b.type === "thinking") return { type: "thinking" as const, thinking: b.thinking, budget_tokens: b.budget_tokens };
        return { type: "text" as const, text: JSON.stringify(b) };
      });

      return {
        type: "assistant",
        platform: "claude",
        content: blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(""),
        contentBlocks: blocks,
        stopReason: assist.message.stop_reason,
        model: assist.message.model,
        tokenUsage: {
          input: assist.message.usage.input_tokens,
          output: assist.message.usage.output_tokens,
          cacheCreation: assist.message.usage.cache_creation_input_tokens,
          cacheRead: assist.message.usage.cache_read_input_tokens,
        },
        raw: msg,
      };
    }

    case "result": {
      const result = msg as CLIResultMessage;
      return {
        type: "complete",
        platform: "claude",
        isError: result.is_error,
        resultText: result.result,
        costUsd: result.total_cost_usd,
        durationMs: result.duration_ms,
        numTurns: result.num_turns,
        linesAdded: result.total_lines_added,
        linesRemoved: result.total_lines_removed,
        tokenUsage: {
          input: result.usage.input_tokens,
          output: result.usage.output_tokens,
          cacheCreation: result.usage.cache_creation_input_tokens,
          cacheRead: result.usage.cache_read_input_tokens,
        },
        raw: msg,
      };
    }

    case "stream_event": {
      const _stream = msg as CLIStreamEventMessage;
      return {
        type: "progress",
        platform: "claude",
        raw: msg,
      };
    }

    case "tool_progress": {
      const tp = msg as CLIToolProgressMessage;
      return {
        type: "progress",
        platform: "claude",
        toolUseId: tp.tool_use_id,
        toolName: tp.tool_name,
        elapsedSeconds: tp.elapsed_time_seconds,
        raw: msg,
      };
    }

    case "control_request": {
      const cr = msg as CLIControlRequestMessage;
      return {
        type: "control_request",
        platform: "claude",
        requestId: cr.request_id,
        request: cr.request,
        raw: msg,
      };
    }

    case "keep_alive":
      return { type: "keep_alive", platform: "claude" };

    default:
      return null;
  }
}

// ─── Claude Adapter ─────────────────────────────────────────────────────────

export class ClaudeAdapter implements CLIAdapter {
  readonly platform = "claude" as const;
  readonly capabilities: CLICapabilities = {
    supportsResume: true,
    supportsStreaming: true,
    supportsTools: true,
    supportsMCP: true,
    outputFormat: "ndjson",
    inputFormat: "ndjson",
    supportsModelFlag: true,
    supportsThinking: true,
    supportsInteractive: true,
  };

  async detect(): Promise<CLIDetectResult> {
    try {
      const proc = Bun.spawn(["claude", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const code = await proc.exited;
      if (code === 0 && output.trim()) {
        return {
          available: true,
          version: output.trim().split("\n")[0],
          path: resolveClaudeBinary(),
        };
      }
      return { available: false };
    } catch {
      return { available: false };
    }
  }

  async launch(
    opts: AdapterLaunchOptions,
    onMessage: (msg: NormalizedMessage) => void,
    onExit: (code: number) => void,
  ): Promise<CLIProcess> {
    const binary = resolveClaudeBinary();

    const args: string[] = [
      "--print",
      "--output-format", "stream-json",
      "--input-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--model", opts.model ?? "claude-sonnet-4-6",
    ];

    if (opts.bare) args.push("--bare");
    if (opts.thinkingBudget !== undefined) args.push("--thinking-budget", String(opts.thinkingBudget));
    if (opts.permissionMode) args.push("--permission-mode", opts.permissionMode);
    if (opts.resume && opts.cliSessionId) {
      args.push("--resume", opts.cliSessionId, "--replay-user-messages");
    }

    // Inject hooks config
    let hooksCleanup: (() => void) | undefined;
    if (opts.hooksUrl) {
      hooksCleanup = injectHooksConfig(opts.cwd, opts.hooksUrl, opts.sessionId, opts.hookSecret ?? "");
    }

    log.info("Launching Claude CLI", {
      binary,
      cwd: opts.cwd,
      model: opts.model,
      sessionId: opts.sessionId,
      resume: opts.resume,
    });

    const env = buildCleanEnv(opts.envVars);

    let spawnCmd: string[];
    if (binary.endsWith(".js") || binary.endsWith(".mjs")) {
      spawnCmd = ["node", binary, ...args];
    } else if (binary.endsWith(".cmd") || binary.endsWith(".bat")) {
      spawnCmd = ["cmd", "/c", binary, ...args];
    } else {
      spawnCmd = [binary, ...args];
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

    // Stderr buffer
    const stderrLines: string[] = [];
    const MAX_STDERR_LINES = 20;

    // Read stream helper
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
              const normalized = parseClaudeMessage(trimmed);
              if (normalized) {
                onMessage(normalized);
              } else {
                // Pass raw for control_response etc
                onMessage({
                  type: "keep_alive",
                  platform: "claude",
                  raw: (() => { try { return JSON.parse(trimmed); } catch { return trimmed; } })(),
                });
              }
            } else {
              log.debug("CLI stderr", { line: trimmed.slice(0, 200) });
              stderrLines.push(trimmed.slice(0, 300));
              if (stderrLines.length > MAX_STDERR_LINES) stderrLines.shift();
            }
          }
        }

        if (buffer.trim()) {
          if (label === "stdout") {
            const normalized = parseClaudeMessage(buffer.trim());
            if (normalized) onMessage(normalized);
          } else {
            stderrLines.push(buffer.trim().slice(0, 300));
            if (stderrLines.length > MAX_STDERR_LINES) stderrLines.shift();
          }
        }
      } catch (err) {
        log.error(`Error reading CLI ${label}`, { error: String(err) });
      }
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    const exited = proc.exited.then((code) => {
      log.info("CLI process exited", { pid, code, sessionId: opts.sessionId });
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
      try { proc.kill(); } catch { /* already dead */ }
    };

    // Early exit detection
    setTimeout(() => {
      try {
        if (proc.exitCode !== null) {
          log.warn("CLI process exited early", { pid, code: proc.exitCode, sessionId: opts.sessionId });
        }
      } catch { /* ignore */ }
    }, 2000);

    return {
      pid,
      send,
      kill,
      exited,
      isAlive: () => { try { return proc.exitCode === null; } catch { return false; } },
      getStderrLines: () => [...stderrLines],
    };
  }

  formatUserMessage(content: string): string {
    return JSON.stringify({
      type: "user",
      message: { role: "user", content },
    });
  }
}
