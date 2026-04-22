/**
 * OpenCode CLI Adapter — Universal AI coding agent with 75+ providers.
 * Uses `opencode run` with --format json for JSONL output.
 * Supports local models (Ollama, LM Studio) and cloud providers.
 *
 * Tested against OpenCode v1.3.17.
 * JSON event format: { type, timestamp, sessionID, part: { type, ... } }
 * Part types: step-start, text, step-finish, reasoning, tool, patch
 */

import { createLogger } from "../../logger.js";
import type {
  CLIAdapter,
  CLICapabilities,
  CLIDetectResult,
  CLIProcess,
  AdapterLaunchOptions,
  NormalizedMessage,
} from "@companion/shared";
import { injectCompanionMcpOpenCode } from "./mcp-injection.js";

const log = createLogger("opencode-adapter");

// ─── OpenCode JSON event shape (v1.3.17) ────────────────────────────────────

interface OpenCodeTokens {
  total: number;
  input: number;
  output: number;
  reasoning: number;
  cache: { write: number; read: number };
}

interface OpenCodePart {
  id: string;
  messageID: string;
  sessionID: string;
  type: string;
  snapshot?: string;
  // text parts
  text?: string;
  time?: { start: number; end: number };
  metadata?: Record<string, unknown>;
  // step-finish parts
  reason?: string;
  tokens?: OpenCodeTokens;
  cost?: number;
  // tool parts
  tool?: string;
  callID?: string;
  state?: {
    status: string;
    input: Record<string, unknown>;
    output: string;
  };
}

interface OpenCodeEvent {
  type: string;
  timestamp: number;
  sessionID: string;
  part: OpenCodePart;
}

/**
 * Parse OpenCode CLI JSON output into NormalizedMessage.
 * `opencode run --format json` emits one JSON event per line.
 *
 * Real event types (v1.3.17): step_start, text, step_finish
 * Real part types: step-start, text, step-finish, reasoning, tool, patch
 */
export function parseOpenCodeMessage(line: string): NormalizedMessage | null {
  let event: OpenCodeEvent;
  try {
    event = JSON.parse(line) as OpenCodeEvent;
  } catch {
    // Non-JSON line (startup banner, diagnostic log) — route to stderr buffer,
    // never surface as assistant content.
    return null;
  }

  // Guard: must have part object
  const part = event.part;
  if (!part || typeof part !== "object") {
    return { type: "progress", platform: "opencode", raw: event };
  }

  // part.type uses dashes ("step-start"); event.type uses underscores ("step_start").
  // Normalize so we can match on a single canonical form.
  const normalize = (s: string | undefined) => (s ?? "").replace(/_/g, "-");
  const partType = normalize(part.type) || normalize(event.type);

  // ── step-start → system_init ──────────────────────────────────────────
  if (partType === "step-start") {
    return {
      type: "system_init",
      platform: "opencode",
      sessionId: event.sessionID ?? part.sessionID,
      raw: event,
    };
  }

  // ── text → assistant ──────────────────────────────────────────────────
  if (partType === "text") {
    const text = part.text ?? "";
    return {
      type: "assistant",
      platform: "opencode",
      content: text,
      contentBlocks: [{ type: "text", text }],
      raw: event,
    };
  }

  // ── reasoning → progress (thinking block) ─────────────────────────────
  if (partType === "reasoning") {
    const text = part.text ?? "";
    return {
      type: "progress",
      platform: "opencode",
      contentBlocks: [{ type: "thinking", thinking: text }],
      raw: event,
    };
  }

  // ── tool → assistant (tool_use) + tool_result ─────────────────────────
  if (partType === "tool") {
    const state = part.state;
    const toolName = part.tool ?? "unknown";
    const callId = part.callID ?? part.id;

    // Tool is completed — emit as tool_result
    if (state?.status === "completed") {
      return {
        type: "assistant",
        platform: "opencode",
        contentBlocks: [
          {
            type: "tool_use",
            id: callId,
            name: toolName,
            input: state.input ?? {},
          },
        ],
        raw: event,
      };
    }

    // Tool in-progress or other status
    return {
      type: "assistant",
      platform: "opencode",
      contentBlocks: [
        {
          type: "tool_use",
          id: callId,
          name: toolName,
          input: state?.input ?? {},
        },
      ],
      raw: event,
    };
  }

  // ── patch → tool_result (file diff) ───────────────────────────────────
  if (partType === "patch") {
    const text = part.text ?? "";
    return {
      type: "tool_result",
      platform: "opencode",
      content: text,
      contentBlocks: [{ type: "text", text }],
      raw: event,
    };
  }

  // ── step-finish → complete (tokens + cost) ────────────────────────────
  if (partType === "step-finish") {
    const tokens = part.tokens;
    return {
      type: "complete",
      platform: "opencode",
      isError: part.reason === "error",
      costUsd: part.cost,
      tokenUsage: tokens
        ? {
            input: tokens.input,
            output: tokens.output,
            cacheRead: tokens.cache?.read,
            cacheCreation: tokens.cache?.write,
          }
        : undefined,
      raw: event,
    };
  }

  // ── error ─────────────────────────────────────────────────────────────
  if (event.type === "error" || partType === "error") {
    return {
      type: "error",
      platform: "opencode",
      errorMessage:
        part.text ?? (event as unknown as Record<string, string>).message ?? "Unknown error",
      raw: event,
    };
  }

  // ── Unknown — pass through as progress ────────────────────────────────
  return {
    type: "progress",
    platform: "opencode",
    raw: event,
  };
}

export class OpenCodeAdapter implements CLIAdapter {
  readonly platform = "opencode" as const;
  readonly capabilities: CLICapabilities = {
    supportsResume: true, // --continue / --session <id>
    supportsStreaming: true,
    supportsTools: true,
    supportsMCP: true,
    outputFormat: "ndjson", // --format json outputs JSON events per line
    inputFormat: "text",
    supportsModelFlag: true,
    supportsThinking: true,
    supportsInteractive: false, // run mode is non-interactive (one-shot)
  };

  async detect(): Promise<CLIDetectResult> {
    try {
      const proc = Bun.spawn(["opencode", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const code = await proc.exited;
      if (code === 0 && output.trim()) {
        return {
          available: true,
          version: output.trim().split("\n")[0],
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
    const args: string[] = ["run"];

    // Prompt as positional argument
    if (opts.prompt) {
      args.push(opts.prompt);
    }

    // JSON output format
    args.push("--format", "json");

    // Model (provider/model format)
    if (opts.model) {
      args.push("--model", opts.model);
    }

    // Working directory
    if (opts.cwd) {
      args.push("--dir", opts.cwd);
    }

    // Resume session
    if (opts.resume) {
      args.push("--continue");
    }

    // Session ID — continue a specific session
    if (opts.cliSessionId) {
      args.push("--session", opts.cliSessionId);
    } else if (opts.platformOptions?.continueSession && opts.sessionId) {
      args.push("--session", opts.sessionId);
    }

    // Fork — branch from existing session (requires --continue or --session)
    if (opts.platformOptions?.fork) {
      args.push("--fork");
    }

    // Attach to a running opencode serve instance (faster MCP cold starts)
    const attachUrl = opts.platformOptions?.attach as string | undefined;
    if (attachUrl) {
      args.push("--attach", attachUrl);
    }

    // Password for remote server auth
    const password = opts.platformOptions?.password as string | undefined;
    if (password) {
      args.push("--password", password);
    }

    // Session title
    const title = opts.platformOptions?.title as string | undefined;
    if (title) {
      args.push("--title", title);
    }

    // File attachments
    const files = opts.platformOptions?.files as string[] | undefined;
    if (files?.length) {
      for (const f of files) {
        args.push("--file", f);
      }
    }

    // Command mode — run a command, message becomes args
    const command = opts.platformOptions?.command as string | undefined;
    if (command) {
      args.push("--command", command);
    }

    // Share session after completion
    if (opts.platformOptions?.share) {
      args.push("--share");
    }

    // Thinking mode
    const thinking = opts.platformOptions?.thinking as boolean | undefined;
    if (thinking) {
      args.push("--thinking");
    }

    // Model variant (reasoning effort)
    const variant = opts.platformOptions?.variant as string | undefined;
    if (variant) {
      args.push("--variant", variant);
    }

    // Agent
    const agent = opts.platformOptions?.agent as string | undefined;
    if (agent) {
      args.push("--agent", agent);
    }

    log.info("Launching OpenCode CLI", {
      cwd: opts.cwd,
      model: opts.model,
      sessionId: opts.sessionId,
      hasPrompt: !!opts.prompt,
    });

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    if (opts.envVars) Object.assign(env, opts.envVars);

    // Inject companion-agent MCP config so Wiki KB + CodeGraph tools are
    // reachable from OpenCode sessions.
    const apiUrl = process.env.COMPANION_API_URL ?? `http://localhost:${process.env.PORT ?? 3579}`;
    const apiKey = process.env.API_KEY ?? "";
    const projectSlug = (opts.platformOptions?.projectSlug as string | undefined) ?? "";
    const mcpCleanup = injectCompanionMcpOpenCode(opts.cwd, apiUrl, apiKey, projectSlug);

    const proc = Bun.spawn(["opencode", ...args], {
      cwd: opts.cwd,
      env,
      stdin: "ignore", // run mode is one-shot; piping stdin can block opencode
      stdout: "pipe",
      stderr: "pipe",
    });

    const pid = proc.pid;
    log.info("OpenCode CLI started", { pid, sessionId: opts.sessionId });

    const stderrLines: string[] = [];
    const MAX_STDERR = 20;

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
              const msg = parseOpenCodeMessage(trimmed);
              if (msg) {
                onMessage(msg);
              } else {
                // Non-JSON stdout line — diagnostic noise, funnel to stderr buffer
                stderrLines.push(trimmed.slice(0, 300));
                if (stderrLines.length > MAX_STDERR) stderrLines.shift();
              }
            } else {
              stderrLines.push(trimmed.slice(0, 300));
              if (stderrLines.length > MAX_STDERR) stderrLines.shift();
            }
          }
        }
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (label === "stdout") {
            const msg = parseOpenCodeMessage(trimmed);
            if (msg) onMessage(msg);
            else {
              stderrLines.push(trimmed.slice(0, 300));
              if (stderrLines.length > MAX_STDERR) stderrLines.shift();
            }
          } else {
            stderrLines.push(trimmed.slice(0, 300));
            if (stderrLines.length > MAX_STDERR) stderrLines.shift();
          }
        }
      } catch (err) {
        log.error(`Error reading OpenCode ${label}`, { error: String(err) });
      }
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    const exited = proc.exited.then((code) => {
      log.info("OpenCode CLI exited", { pid, code, sessionId: opts.sessionId });
      mcpCleanup();
      onExit(code);
      return code;
    });

    return {
      pid,
      send: (_data: string) => {
        log.warn(
          "OpenCode run mode is non-interactive — send() is a no-op. Use a new session instead.",
        );
      },
      kill: () => {
        try {
          proc.kill();
        } catch {
          /* dead */
        }
      },
      exited,
      isAlive: () => {
        try {
          return proc.exitCode === null;
        } catch {
          return false;
        }
      },
      getStderrLines: () => [...stderrLines],
    };
  }

  formatUserMessage(content: string): string {
    return content;
  }
}
