/**
 * Codex CLI Adapter — OpenAI's Codex CLI coding agent.
 * Uses `codex exec --json` for non-interactive JSONL output.
 *
 * Event schema (codex-cli 0.118.0):
 *   thread.started   { type, thread_id }                       → system_init
 *   turn.started     { type }                                  → progress
 *   item.started     { type, item: { id, type, ... } }         → tool_use (for command_execution)
 *   item.completed   { type, item: { id, type, text?, ... } }  → assistant | tool_result
 *   turn.completed   { type, usage: { input_tokens, ... } }    → complete
 *
 * Item types:
 *   agent_message     { id, type, text }                       → assistant text
 *   command_execution { id, type, command, aggregated_output, exit_code, status }
 *
 * Requires OPENAI_API_KEY env var.
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
import { injectCompanionMcpCodex } from "./mcp-injection.js";

const log = createLogger("codex-adapter");

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
}

/**
 * Parse Codex CLI JSONL output.
 * Returns null for non-JSON lines (stderr-style log leakage) so they route to the
 * diagnostic stderr buffer instead of the user-visible content stream.
 */
export function parseCodexMessage(line: string): NormalizedMessage | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const type = parsed.type as string | undefined;
  if (!type) return null;

  switch (type) {
    case "thread.started":
      return {
        type: "system_init",
        platform: "codex",
        sessionId: parsed.thread_id as string | undefined,
        raw: parsed,
      };

    case "turn.started":
      return { type: "progress", platform: "codex", raw: parsed };

    case "item.started": {
      const item = parsed.item as CodexItem | undefined;
      if (!item) return { type: "progress", platform: "codex", raw: parsed };

      if (item.type === "command_execution") {
        return {
          type: "assistant",
          platform: "codex",
          contentBlocks: [
            {
              type: "tool_use",
              id: item.id ?? crypto.randomUUID(),
              name: "command_execution",
              input: { command: item.command ?? "" },
            },
          ],
          toolUseId: item.id,
          toolName: "command_execution",
          toolInput: { command: item.command ?? "" },
          raw: parsed,
        };
      }
      return { type: "progress", platform: "codex", raw: parsed };
    }

    case "item.completed": {
      const item = parsed.item as CodexItem | undefined;
      if (!item) return { type: "progress", platform: "codex", raw: parsed };

      if (item.type === "agent_message") {
        const text = item.text ?? "";
        return {
          type: "assistant",
          platform: "codex",
          content: text,
          contentBlocks: [{ type: "text", text }],
          raw: parsed,
        };
      }

      if (item.type === "command_execution") {
        const isError =
          item.status === "failed" || (typeof item.exit_code === "number" && item.exit_code !== 0);
        return {
          type: "tool_result",
          platform: "codex",
          toolUseId: item.id,
          toolResult: item.aggregated_output ?? "",
          toolIsError: isError,
          raw: parsed,
        };
      }

      return { type: "progress", platform: "codex", raw: parsed };
    }

    case "turn.completed": {
      const usage = parsed.usage as
        | { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number }
        | undefined;
      return {
        type: "complete",
        platform: "codex",
        isError: false,
        tokenUsage: usage
          ? {
              input: usage.input_tokens ?? 0,
              output: usage.output_tokens ?? 0,
              cacheRead: usage.cached_input_tokens,
            }
          : undefined,
        raw: parsed,
      };
    }

    case "error":
      return {
        type: "error",
        platform: "codex",
        errorMessage:
          (parsed.message as string) ?? (parsed.error as string) ?? "Unknown Codex error",
        raw: parsed,
      };

    default:
      return { type: "progress", platform: "codex", raw: parsed };
  }
}

export class CodexAdapter implements CLIAdapter {
  readonly platform = "codex" as const;
  readonly capabilities: CLICapabilities = {
    supportsResume: false, // exec mode is one-shot, no resume
    supportsStreaming: true,
    supportsTools: true,
    supportsMCP: true,
    outputFormat: "ndjson", // --json flag outputs JSONL
    inputFormat: "text",
    supportsModelFlag: true,
    supportsThinking: false,
    supportsInteractive: false, // exec mode is non-interactive
  };

  async detect(): Promise<CLIDetectResult> {
    try {
      const proc = Bun.spawn(["codex", "--version"], {
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
    const args: string[] = ["exec"];

    // JSONL output
    args.push("--json");

    // Model
    if (opts.model) {
      args.push("--model", opts.model);
    }

    // Working directory
    if (opts.cwd) {
      args.push("-C", opts.cwd);
    }

    // Auto-approve mode
    const fullAuto = opts.platformOptions?.fullAuto as boolean | undefined;
    if (fullAuto) {
      args.push("--full-auto");
    }

    // Approval mode. "plan" is a Companion-layer concept — Codex doesn't accept
    // it natively, so we map to the most conservative native mode (`suggest`)
    // and rely on the prompt prefix injected by ws-session-lifecycle to hold
    // the model back from executing anything.
    const approvalMode = opts.platformOptions?.approvalMode as string | undefined;
    if (approvalMode) {
      const native = approvalMode === "plan" ? "suggest" : approvalMode;
      args.push("-a", native);
    }

    // Prompt must come LAST as positional arg — codex exec otherwise waits on stdin
    if (opts.prompt) {
      args.push(opts.prompt);
    }

    log.info("Launching Codex CLI", {
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

    // Inject companion-agent MCP config (TOML) so Wiki KB + CodeGraph tools
    // are reachable from Codex sessions.
    const apiUrl = process.env.COMPANION_API_URL ?? `http://localhost:${process.env.PORT ?? 3579}`;
    const apiKey = process.env.API_KEY ?? "";
    const projectSlug = (opts.platformOptions?.projectSlug as string | undefined) ?? "";
    const mcpCleanup = injectCompanionMcpCodex(opts.cwd, apiUrl, apiKey, projectSlug);

    const proc = Bun.spawn(["codex", ...args], {
      cwd: opts.cwd,
      env,
      stdin: "ignore", // exec mode is one-shot; piping stdin causes codex to block on "Reading additional input from stdin..."
      stdout: "pipe",
      stderr: "pipe",
    });

    const pid = proc.pid;
    log.info("Codex CLI started", { pid, sessionId: opts.sessionId });

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
              const msg = parseCodexMessage(trimmed);
              if (msg) {
                onMessage(msg);
              } else {
                // Non-JSON stdout line (tracing logs, ANSI error output) → diagnostic buffer
                stderrLines.push(trimmed.slice(0, 500));
                if (stderrLines.length > MAX_STDERR) stderrLines.shift();
              }
            } else {
              stderrLines.push(trimmed.slice(0, 500));
              if (stderrLines.length > MAX_STDERR) stderrLines.shift();
            }
          }
        }
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (label === "stdout") {
            const msg = parseCodexMessage(trimmed);
            if (msg) onMessage(msg);
            else {
              stderrLines.push(trimmed.slice(0, 500));
              if (stderrLines.length > MAX_STDERR) stderrLines.shift();
            }
          } else {
            stderrLines.push(trimmed.slice(0, 500));
            if (stderrLines.length > MAX_STDERR) stderrLines.shift();
          }
        }
      } catch (err) {
        log.error(`Error reading Codex ${label}`, { error: String(err) });
      }
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    const exited = proc.exited.then((code) => {
      log.info("Codex CLI exited", { pid, code, sessionId: opts.sessionId });
      mcpCleanup();
      onExit(code);
      return code;
    });

    return {
      pid,
      send: (_data: string) => {
        log.warn(
          "Codex exec mode is non-interactive — send() is a no-op. Use a new session instead.",
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

  async listModels(): Promise<import("@companion/shared").CLIModelInfo[]> {
    return [
      { id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
      { id: "o4-mini", name: "o4-mini", provider: "openai" },
      { id: "o3", name: "o3", provider: "openai" },
      { id: "codex-mini-latest", name: "Codex Mini", provider: "openai" },
    ];
  }
}
