/**
 * Gemini CLI Adapter — Google's Gemini CLI coding agent.
 * Supports stream-json output format (same as Claude Code).
 * Free tier: 60 req/min, 1000 req/day with Google Account auth.
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

const log = createLogger("gemini-adapter");

/**
 * Parse Gemini CLI stream-json output into NormalizedMessage.
 * Gemini supports --output-format stream-json which is similar to Claude's NDJSON.
 * For now, we parse known event shapes; unknown events pass through as raw.
 */
function parseGeminiMessage(line: string): NormalizedMessage | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    // Plain text output — wrap as assistant message
    if (line.trim()) {
      return {
        type: "assistant",
        platform: "gemini",
        content: line,
        contentBlocks: [{ type: "text", text: line }],
      };
    }
    return null;
  }

  // Gemini stream-json events — map to NormalizedMessage
  const type = parsed.type as string | undefined;

  if (type === "system" && parsed.subtype === "init") {
    return {
      type: "system_init",
      platform: "gemini",
      sessionId: parsed.session_id as string | undefined,
      cwd: parsed.cwd as string | undefined,
      tools: (parsed.tools as string[]) ?? [],
      model: parsed.model as string | undefined,
      cliVersion: parsed.version as string | undefined,
      raw: parsed,
    };
  }

  if (type === "assistant" || type === "response") {
    const content = (parsed.content as string)
      ?? (parsed.text as string)
      ?? (parsed.message as { content?: string })?.content
      ?? "";
    return {
      type: "assistant",
      platform: "gemini",
      content,
      contentBlocks: [{ type: "text", text: content }],
      model: parsed.model as string | undefined,
      raw: parsed,
    };
  }

  if (type === "result" || type === "done") {
    return {
      type: "complete",
      platform: "gemini",
      isError: false,
      resultText: parsed.result as string | undefined,
      costUsd: parsed.total_cost_usd as number | undefined,
      raw: parsed,
    };
  }

  if (type === "error") {
    return {
      type: "error",
      platform: "gemini",
      errorMessage: (parsed.error as string) ?? (parsed.message as string) ?? "Unknown error",
      raw: parsed,
    };
  }

  if (type === "tool_use" || type === "tool_call") {
    return {
      type: "assistant",
      platform: "gemini",
      contentBlocks: [{
        type: "tool_use",
        id: (parsed.id as string) ?? crypto.randomUUID(),
        name: (parsed.name as string) ?? (parsed.tool_name as string) ?? "unknown",
        input: (parsed.input as Record<string, unknown>) ?? {},
      }],
      raw: parsed,
    };
  }

  // Unknown event — pass through as progress
  return {
    type: "progress",
    platform: "gemini",
    raw: parsed,
  };
}

export class GeminiAdapter implements CLIAdapter {
  readonly platform = "gemini" as const;
  readonly capabilities: CLICapabilities = {
    supportsResume: true,
    supportsStreaming: true,
    supportsTools: true,
    supportsMCP: true,
    outputFormat: "ndjson", // stream-json is NDJSON
    inputFormat: "text",
    supportsModelFlag: true,
    supportsThinking: false,
    supportsInteractive: true,
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

    // Use --prompt for non-interactive headless mode
    if (opts.prompt) {
      args.push("--prompt", opts.prompt);
    }

    // Output format
    args.push("--output-format", "stream-json");

    // Model
    if (opts.model) {
      args.push("--model", opts.model);
    }

    // YOLO mode for full auto-approve
    const yolo = opts.platformOptions?.yolo as boolean | undefined;
    if (yolo) {
      args.push("--yolo");
    }

    // Sandbox
    const sandbox = opts.platformOptions?.sandbox as boolean | undefined;
    if (sandbox) {
      args.push("--sandbox");
    }

    // Resume — requires a specific session ID, not "latest"
    if (opts.resume && opts.sessionId) {
      args.push("--resume", opts.sessionId);
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
    const MAX_STDERR = 20;

    // Read stdout
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
              const msg = parseGeminiMessage(trimmed);
              if (msg) onMessage(msg);
            } else {
              stderrLines.push(trimmed.slice(0, 300));
              if (stderrLines.length > MAX_STDERR) stderrLines.shift();
            }
          }
        }
        if (buffer.trim() && label === "stdout") {
          const msg = parseGeminiMessage(buffer.trim());
          if (msg) onMessage(msg);
        }
      } catch (err) {
        log.error(`Error reading Gemini ${label}`, { error: String(err) });
      }
    };

    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    const exited = proc.exited.then((code) => {
      log.info("Gemini CLI exited", { pid, code, sessionId: opts.sessionId });
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
      kill: () => { try { proc.kill(); } catch { /* dead */ } },
      exited,
      isAlive: () => { try { return proc.exitCode === null; } catch { return false; } },
      getStderrLines: () => [...stderrLines],
    };
  }

  formatUserMessage(content: string): string {
    // Gemini stdin in interactive mode accepts plain text
    return content;
  }
}
