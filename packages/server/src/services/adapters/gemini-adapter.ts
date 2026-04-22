/**
 * Gemini CLI Adapter — Google's Gemini CLI coding agent.
 *
 * Uses `--output-format stream-json` in one-shot headless mode.
 * Event schema (from gemini-cli JsonStreamEventType):
 *   init          { type, timestamp, session_id, model }
 *   message       { type, timestamp, role, content, delta? }
 *   tool_use      { type, timestamp, tool_name, tool_id, parameters }
 *   tool_result   { type, timestamp, tool_id, status, output?, error? }
 *   error         { type, timestamp, severity, message }
 *   result        { type, timestamp, status, error?, stats? }
 *
 * Free tier: 60 req/min, 1000 req/day with Google Account OAuth.
 *
 * Limitation: Gemini CLI does not support continuous JSON stdin in stream-json
 * mode — each launch is one-shot. supportsInteractive is false; ws-session-lifecycle
 * should relaunch per user turn. (Multi-turn would require --acp mode, not wired yet.)
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
import { injectCompanionMcpGemini } from "./mcp-injection.js";

const log = createLogger("gemini-adapter");

/**
 * Parse a Gemini stream-json line into a NormalizedMessage.
 * Returns null for lines that should be treated as noise (non-JSON, MCP startup logs, etc).
 */
export function parseGeminiMessage(line: string): NormalizedMessage | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    // Non-JSON output (MCP init logs, stack traces, pre-bundled banners) — skip.
    // These get captured by the stderr buffer for diagnostics, not surfaced as messages.
    return null;
  }

  const type = parsed.type as string | undefined;
  if (!type || typeof type !== "string") return null;

  switch (type) {
    case "init": {
      return {
        type: "system_init",
        platform: "gemini",
        sessionId: parsed.session_id as string | undefined,
        model: parsed.model as string | undefined,
        raw: parsed,
      };
    }

    case "message": {
      const role = parsed.role as string | undefined;
      const content = (parsed.content as string) ?? "";
      // Skip echoed user messages — they're noise for our pipeline
      if (role === "user") {
        return { type: "progress", platform: "gemini", raw: parsed };
      }
      return {
        type: "assistant",
        platform: "gemini",
        content,
        contentBlocks: [{ type: "text", text: content }],
        raw: parsed,
      };
    }

    case "tool_use": {
      return {
        type: "assistant",
        platform: "gemini",
        contentBlocks: [
          {
            type: "tool_use",
            id: (parsed.tool_id as string) ?? crypto.randomUUID(),
            name: (parsed.tool_name as string) ?? "unknown",
            input: (parsed.parameters as Record<string, unknown>) ?? {},
          },
        ],
        toolUseId: parsed.tool_id as string | undefined,
        toolName: parsed.tool_name as string | undefined,
        toolInput: parsed.parameters as Record<string, unknown> | undefined,
        raw: parsed,
      };
    }

    case "tool_result": {
      const status = parsed.status as string | undefined;
      const errorObj = parsed.error as { message?: string } | undefined;
      return {
        type: "tool_result",
        platform: "gemini",
        toolUseId: parsed.tool_id as string | undefined,
        toolResult: (parsed.output as string) ?? errorObj?.message ?? "",
        toolIsError: status === "error",
        raw: parsed,
      };
    }

    case "error": {
      return {
        type: "error",
        platform: "gemini",
        errorMessage: (parsed.message as string) ?? "Unknown error",
        raw: parsed,
      };
    }

    case "result": {
      const status = parsed.status as string | undefined;
      const errorObj = parsed.error as { type?: string; message?: string } | undefined;
      const stats = parsed.stats as { turn_count?: number; total_duration_ms?: number } | undefined;
      return {
        type: "complete",
        platform: "gemini",
        isError: status === "error",
        errorMessage: errorObj?.message,
        resultText: errorObj?.message,
        durationMs: stats?.total_duration_ms,
        numTurns: stats?.turn_count,
        raw: parsed,
      };
    }

    default:
      return { type: "progress", platform: "gemini", raw: parsed };
  }
}

export class GeminiAdapter implements CLIAdapter {
  readonly platform = "gemini" as const;
  readonly capabilities: CLICapabilities = {
    supportsResume: false, // gemini --resume takes index/"latest", not a session ID — disable for now
    supportsStreaming: true,
    supportsTools: true,
    supportsMCP: true,
    outputFormat: "ndjson",
    inputFormat: "text",
    supportsModelFlag: true,
    supportsThinking: false,
    supportsInteractive: false, // stream-json mode is one-shot; relaunch per turn
  };

  async detect(): Promise<CLIDetectResult> {
    try {
      const proc = Bun.spawn(["gemini", "--version"], {
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
    const args: string[] = [];

    // Headless one-shot. If no prompt, default to a no-op to keep the flow consistent.
    if (opts.prompt) {
      args.push("--prompt", opts.prompt);
    }

    args.push("--output-format", "stream-json");

    if (opts.model) {
      args.push("--model", opts.model);
    }

    const yolo = opts.platformOptions?.yolo as boolean | undefined;
    if (yolo) {
      args.push("--yolo");
    }

    const sandbox = opts.platformOptions?.sandbox as boolean | undefined;
    if (sandbox) {
      args.push("--sandbox");
    }

    log.info("Launching Gemini CLI", {
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
    // reachable from Gemini sessions.
    const apiUrl = process.env.COMPANION_API_URL ?? `http://localhost:${process.env.PORT ?? 3579}`;
    const apiKey = process.env.API_KEY ?? "";
    const projectSlug = (opts.platformOptions?.projectSlug as string | undefined) ?? "";
    const mcpCleanup = injectCompanionMcpGemini(opts.cwd, apiUrl, apiKey, projectSlug);

    const proc = Bun.spawn(["gemini", ...args], {
      cwd: opts.cwd,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const pid = proc.pid;
    log.info("Gemini CLI started", { pid, sessionId: opts.sessionId });

    const stderrLines: string[] = [];
    const MAX_STDERR = 30;
    const pushStderr = (line: string) => {
      stderrLines.push(line.slice(0, 500));
      if (stderrLines.length > MAX_STDERR) stderrLines.shift();
    };

    const readStream = async (
      stream: ReadableStream<Uint8Array> | null,
      label: "stdout" | "stderr",
    ) => {
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
              const msg = parseGeminiMessage(trimmed);
              if (msg) {
                onMessage(msg);
              } else {
                // Non-JSON stdout line — treat as diagnostic noise, not user-visible content
                pushStderr(trimmed);
              }
            } else {
              pushStderr(trimmed);
            }
          }
        }
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (label === "stdout") {
            const msg = parseGeminiMessage(trimmed);
            if (msg) onMessage(msg);
            else pushStderr(trimmed);
          } else {
            pushStderr(trimmed);
          }
        }
      } catch (err) {
        log.error(`Error reading Gemini ${label}`, { error: String(err) });
      }
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    const exited = proc.exited.then((code) => {
      log.info("Gemini CLI exited", { pid, code, sessionId: opts.sessionId });
      mcpCleanup();
      onExit(code);
      return code;
    });

    return {
      pid,
      send: (data: string) => {
        try {
          proc.stdin.write(data.endsWith("\n") ? data : data + "\n");
          proc.stdin.flush();
        } catch (err) {
          log.error("Failed to write to Gemini stdin", { error: String(err) });
        }
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
