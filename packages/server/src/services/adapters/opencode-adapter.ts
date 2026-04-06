/**
 * OpenCode CLI Adapter — Universal AI coding agent with 75+ providers.
 * Uses `opencode run` with --format json for JSONL output.
 * Supports local models (Ollama, LM Studio) and cloud providers.
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

const log = createLogger("opencode-adapter");

/**
 * Parse OpenCode CLI JSON output into NormalizedMessage.
 * OpenCode `run --format json` emits JSON events, one per line.
 */
function parseOpenCodeMessage(line: string): NormalizedMessage | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    if (line.trim()) {
      return {
        type: "assistant",
        platform: "opencode",
        content: line,
        contentBlocks: [{ type: "text", text: line }],
      };
    }
    return null;
  }

  const type = parsed.type as string | undefined;
  const event = parsed.event as string | undefined;
  const kind = type ?? event;

  // Session/init event
  if (kind === "session" || kind === "init" || kind === "session.start") {
    return {
      type: "system_init",
      platform: "opencode",
      sessionId: (parsed.sessionId as string) ?? (parsed.session_id as string) ?? undefined,
      model: (parsed.model as string) ?? undefined,
      cwd: (parsed.cwd as string) ?? (parsed.dir as string) ?? undefined,
      raw: parsed,
    };
  }

  // Text/content event
  if (kind === "content" || kind === "text" || kind === "assistant.text") {
    const text = (parsed.content as string)
      ?? (parsed.text as string)
      ?? (parsed.delta as string)
      ?? "";
    return {
      type: "assistant",
      platform: "opencode",
      content: text,
      contentBlocks: [{ type: "text", text }],
      model: parsed.model as string | undefined,
      raw: parsed,
    };
  }

  // Full assistant message (non-streaming)
  if (kind === "message" || kind === "assistant") {
    const content = (parsed.content as string)
      ?? (parsed.text as string)
      ?? "";
    return {
      type: "assistant",
      platform: "opencode",
      content,
      contentBlocks: [{ type: "text", text: content }],
      model: parsed.model as string | undefined,
      raw: parsed,
    };
  }

  // Tool call
  if (kind === "tool_call" || kind === "tool_use" || kind === "assistant.tool") {
    const tool = parsed.tool as Record<string, unknown> | undefined;
    return {
      type: "assistant",
      platform: "opencode",
      contentBlocks: [{
        type: "tool_use",
        id: (parsed.id as string) ?? (tool?.id as string) ?? crypto.randomUUID(),
        name: (parsed.name as string)
          ?? (tool?.name as string)
          ?? (parsed.tool_name as string)
          ?? "unknown",
        input: (parsed.input as Record<string, unknown>)
          ?? (tool?.input as Record<string, unknown>)
          ?? (parsed.args as Record<string, unknown>)
          ?? {},
      }],
      raw: parsed,
    };
  }

  // Tool result
  if (kind === "tool_result" || kind === "tool.result") {
    return {
      type: "tool_result",
      platform: "opencode",
      content: (parsed.output as string) ?? (parsed.result as string) ?? "",
      contentBlocks: [{
        type: "text",
        text: (parsed.output as string) ?? (parsed.result as string) ?? "",
      }],
      raw: parsed,
    };
  }

  // Completion
  if (kind === "done" || kind === "complete" || kind === "session.end") {
    const usage = parsed.usage as Record<string, unknown> | undefined;
    return {
      type: "complete",
      platform: "opencode",
      isError: false,
      costUsd: (parsed.cost as number) ?? (usage?.cost as number) ?? undefined,
      raw: parsed,
    };
  }

  // Error
  if (kind === "error") {
    return {
      type: "error",
      platform: "opencode",
      errorMessage: (parsed.message as string)
        ?? (parsed.error as string)
        ?? "Unknown error",
      raw: parsed,
    };
  }

  // Thinking/reasoning
  if (kind === "thinking" || kind === "reasoning") {
    return {
      type: "progress",
      platform: "opencode",
      raw: parsed,
    };
  }

  // Unknown — pass through as progress
  return {
    type: "progress",
    platform: "opencode",
    raw: parsed,
  };
}

export class OpenCodeAdapter implements CLIAdapter {
  readonly platform = "opencode" as const;
  readonly capabilities: CLICapabilities = {
    supportsResume: false, // run mode is one-shot, no resume
    supportsStreaming: true,
    supportsTools: true,
    supportsMCP: true,
    outputFormat: "ndjson", // --format json outputs JSON events
    inputFormat: "text",
    supportsModelFlag: true,
    supportsThinking: true,
    supportsInteractive: false, // run mode is non-interactive
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

    // Session ID
    if (opts.sessionId && opts.platformOptions?.continueSession) {
      args.push("--session", opts.sessionId);
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

    const proc = Bun.spawn(["opencode", ...args], {
      cwd: opts.cwd,
      env,
      stdin: "pipe",
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
              if (msg) onMessage(msg);
            } else {
              stderrLines.push(trimmed.slice(0, 300));
              if (stderrLines.length > MAX_STDERR) stderrLines.shift();
            }
          }
        }
        if (buffer.trim() && label === "stdout") {
          const msg = parseOpenCodeMessage(buffer.trim());
          if (msg) onMessage(msg);
        }
      } catch (err) {
        log.error(`Error reading OpenCode ${label}`, { error: String(err) });
      }
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    const exited = proc.exited.then((code) => {
      log.info("OpenCode CLI exited", { pid, code, sessionId: opts.sessionId });
      onExit(code);
      return code;
    });

    return {
      pid,
      send: (_data: string) => {
        log.warn("OpenCode run mode is non-interactive — send() is a no-op. Use a new session instead.");
      },
      kill: () => { try { proc.kill(); } catch { /* dead */ } },
      exited,
      isAlive: () => { try { return proc.exitCode === null; } catch { return false; } },
      getStderrLines: () => [...stderrLines],
    };
  }

  formatUserMessage(content: string): string {
    return content;
  }
}
