/**
 * Codex CLI Adapter — OpenAI's Codex CLI coding agent.
 * Uses `codex exec` for non-interactive mode with --json JSONL output.
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

const log = createLogger("codex-adapter");

/**
 * Parse Codex CLI JSONL output into NormalizedMessage.
 * Codex `exec --json` emits JSONL events similar to Claude's stream format.
 */
function parseCodexMessage(line: string): NormalizedMessage | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    if (line.trim()) {
      return {
        type: "assistant",
        platform: "codex",
        content: line,
        contentBlocks: [{ type: "text", text: line }],
      };
    }
    return null;
  }

  const type = parsed.type as string | undefined;
  const event = parsed.event as string | undefined;

  // Message event with assistant role
  if (type === "message" || event === "message") {
    const role = parsed.role as string | undefined;
    const content = parsed.content as unknown;

    if (role === "assistant" || !role) {
      // Content can be string or array of content blocks
      if (typeof content === "string") {
        return {
          type: "assistant",
          platform: "codex",
          content,
          contentBlocks: [{ type: "text", text: content }],
          model: parsed.model as string | undefined,
          raw: parsed,
        };
      }

      if (Array.isArray(content)) {
        const blocks = content.map((block: Record<string, unknown>) => {
          if (block.type === "tool_use" || block.type === "function_call") {
            let blockInput: Record<string, unknown> = {};
            const blockArgs = block.arguments ?? block.input;
            if (typeof blockArgs === "string") {
              try {
                blockInput = JSON.parse(blockArgs);
              } catch {
                blockInput = { raw: blockArgs };
              }
            } else if (blockArgs && typeof blockArgs === "object") {
              blockInput = blockArgs as Record<string, unknown>;
            }
            return {
              type: "tool_use" as const,
              id: (block.id as string) ?? crypto.randomUUID(),
              name: (block.name as string) ?? "unknown",
              input: blockInput,
            };
          }
          return {
            type: "text" as const,
            text: (block.text as string) ?? JSON.stringify(block),
          };
        });

        const textContent = blocks
          .filter((b) => b.type === "text")
          .map((b) => ("text" in b ? b.text : ""))
          .join("");

        return {
          type: "assistant",
          platform: "codex",
          content: textContent || undefined,
          contentBlocks: blocks,
          model: parsed.model as string | undefined,
          raw: parsed,
        };
      }
    }
  }

  // Function/tool call events
  if (type === "function_call" || type === "tool_call" || event === "tool_use") {
    // OpenAI format sends `arguments` as a JSON string — parse it
    let input: Record<string, unknown> = {};
    const rawArgs = parsed.arguments ?? parsed.input;
    if (typeof rawArgs === "string") {
      try {
        input = JSON.parse(rawArgs);
      } catch {
        input = { raw: rawArgs };
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      input = rawArgs as Record<string, unknown>;
    }

    return {
      type: "assistant",
      platform: "codex",
      contentBlocks: [
        {
          type: "tool_use",
          id: (parsed.call_id as string) ?? (parsed.id as string) ?? crypto.randomUUID(),
          name: (parsed.name as string) ?? (parsed.function as string) ?? "unknown",
          input,
        },
      ],
      raw: parsed,
    };
  }

  // Function/tool result
  if (type === "function_call_output" || type === "tool_result" || event === "tool_result") {
    return {
      type: "tool_result",
      platform: "codex",
      content: (parsed.output as string) ?? (parsed.result as string) ?? "",
      contentBlocks: [
        {
          type: "text",
          text: (parsed.output as string) ?? (parsed.result as string) ?? "",
        },
      ],
      raw: parsed,
    };
  }

  // Completion/done event
  if (type === "response.completed" || type === "done" || event === "done") {
    return {
      type: "complete",
      platform: "codex",
      isError: false,
      costUsd: parsed.cost_usd as number | undefined,
      raw: parsed,
    };
  }

  // Error event
  if (type === "error" || event === "error") {
    return {
      type: "error",
      platform: "codex",
      errorMessage: (parsed.message as string) ?? (parsed.error as string) ?? "Unknown error",
      raw: parsed,
    };
  }

  // Status/progress
  if (type === "status" || event === "status") {
    return {
      type: "progress",
      platform: "codex",
      raw: parsed,
    };
  }

  // Unknown event — pass through as progress
  return {
    type: "progress",
    platform: "codex",
    raw: parsed,
  };
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

    // Prompt as positional argument
    if (opts.prompt) {
      args.push(opts.prompt);
    }

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

    // Approval mode
    const approvalMode = opts.platformOptions?.approvalMode as string | undefined;
    if (approvalMode) {
      args.push("-a", approvalMode);
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

    const proc = Bun.spawn(["codex", ...args], {
      cwd: opts.cwd,
      env,
      stdin: "pipe",
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
              if (msg) onMessage(msg);
            } else {
              stderrLines.push(trimmed.slice(0, 300));
              if (stderrLines.length > MAX_STDERR) stderrLines.shift();
            }
          }
        }
        if (buffer.trim() && label === "stdout") {
          const msg = parseCodexMessage(buffer.trim());
          if (msg) onMessage(msg);
        }
      } catch (err) {
        log.error(`Error reading Codex ${label}`, { error: String(err) });
      }
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    const exited = proc.exited.then((code) => {
      log.info("Codex CLI exited", { pid, code, sessionId: opts.sessionId });
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
}
