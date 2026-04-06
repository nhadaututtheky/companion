/**
 * CLI Debate Engine — Orchestrates debates where each agent is a real CLI process
 * (Claude, Codex, Gemini, OpenCode) with full tool access.
 *
 * Unlike the API debate engine, CLI agents can read files, run commands,
 * and use MCP tools. This is the killer feature of Companion.
 *
 * Architecture:
 * - Reuses channel infrastructure (DB storage, messages, rounds)
 * - Spawns CLI processes via adapter registry
 * - Turn-based: agents respond sequentially (avoids file conflicts)
 * - Collects full response, stores in channel, passes to next agent
 */

import { createChannel, postMessage, getChannelMessages } from "./channel-manager.js";
import { getDb } from "../db/client.js";
import { channels } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getAdapter } from "./adapters/adapter-registry.js";
import { createLogger } from "../logger.js";
import type { CLIPlatform, NormalizedMessage, CLIProcess } from "@companion/shared";

const log = createLogger("cli-debate-engine");

const DEFAULT_MAX_ROUNDS = 3; // CLI debates are slower/costlier
const RESPONSE_TIMEOUT_MS = 180_000; // 3 min per agent response
const MAX_RESPONSE_LENGTH = 8000; // chars per agent response

// ── Types ──────────────────────────────────────────────────────────────────

export interface CLIDebateAgent {
  id: string;
  role: string;
  label: string;
  emoji: string;
  platform: CLIPlatform;
  model: string;
  /** Platform-specific launch options */
  platformOptions?: Record<string, unknown>;
}

export interface CLIDebateConfig {
  topic: string;
  format: "pro_con" | "code_review" | "architecture" | "benchmark";
  agents: CLIDebateAgent[];
  workingDir: string;
  projectSlug?: string;
  maxRounds?: number;
}

export interface CLIDebateState {
  channelId: string;
  topic: string;
  format: string;
  agents: CLIDebateAgent[];
  currentRound: number;
  maxRounds: number;
  status: "active" | "concluding" | "concluded" | "error";
  /** Active CLI processes — killed on conclude/abort */
  processes: Map<string, CLIProcess>;
  workingDir: string;
}

// ── Active CLI debates (in-memory) ────────────────────────────────────────

const activeCLIDebates = new Map<string, CLIDebateState>();

export function getActiveCLIDebate(channelId: string): CLIDebateState | undefined {
  return activeCLIDebates.get(channelId);
}

export function listActiveCLIDebates(): CLIDebateState[] {
  return [...activeCLIDebates.values()].filter((d) => d.status === "active");
}

// ── Debate prompt builders ────────────────────────────────────────────────

function buildDebatePrompt(opts: {
  topic: string;
  format: string;
  role: string;
  agentLabel: string;
  opponentLabel: string;
  opponentPlatform: string;
  previousRounds: Array<{ agentId: string; content: string; round: number }>;
  round: number;
}): string {
  const { topic, format, role, agentLabel, opponentLabel, opponentPlatform, previousRounds, round } = opts;

  const formatInstructions: Record<string, string> = {
    pro_con: `You are ${agentLabel}, arguing ${role === "advocate" ? "FOR" : "AGAINST"} this approach.`,
    code_review: role === "builder"
      ? `You are ${agentLabel}. Write or improve the code for the task described below.`
      : `You are ${agentLabel}. Review the code written by your opponent and suggest improvements.`,
    architecture: `You are ${agentLabel}. Propose and defend your architectural approach with real code examples.`,
    benchmark: `You are ${agentLabel}. Solve the task below. Your solution will be compared against ${opponentLabel}'s.`,
  };

  let prompt = `<debate-context>
TOPIC: ${topic}
FORMAT: ${format}
ROUND: ${round}
YOUR ROLE: ${formatInstructions[format] ?? formatInstructions.pro_con}

You are debating against ${opponentLabel} (${opponentPlatform}).
You may read files, run commands, and write code to support your argument.
Keep your response focused and under 2000 words.
</debate-context>\n\n`;

  if (previousRounds.length > 0) {
    prompt += `<previous-rounds>\n`;
    for (const msg of previousRounds) {
      const label = msg.agentId === opts.agentLabel ? "YOU" : opponentLabel;
      prompt += `[Round ${msg.round} — ${label}]\n${msg.content}\n\n`;
    }
    prompt += `</previous-rounds>\n\n`;
    prompt += `Now respond to ${opponentLabel}'s latest argument. Build on your previous points and address their claims.`;
  } else {
    prompt += `This is the opening round. Present your initial argument with supporting evidence, code, or analysis.`;
  }

  return prompt;
}

// ── Response collector ────────────────────────────────────────────────────

function collectCLIResponse(
  proc: CLIProcess,
  timeoutMs: number,
): Promise<{ content: string; toolUse: string[] }> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const toolNames: string[] = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        resolve({
          content: chunks.join("") || "[Response timed out]",
          toolUse: toolNames,
        });
      }
    }, timeoutMs);

    // The process's onMessage was already set during launch
    // We need a different approach — listen on the exited promise
    proc.exited.then(() => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          content: chunks.join("") || "[No response]",
          toolUse: toolNames,
        });
      }
    });
  });
}

// ── Main engine ──────────────────────────────────────────────────────────

export async function startCLIDebate(
  config: CLIDebateConfig,
  onMessage: (msg: { type: string; agentId?: string; round?: number; content?: string; channelId?: string }) => void,
): Promise<CLIDebateState> {
  if (config.agents.length < 2) {
    throw new Error("CLI debate requires at least 2 agents");
  }

  // Create channel
  const channel = createChannel({
    projectSlug: config.projectSlug,
    type: "debate",
    topic: config.topic,
    maxRounds: config.maxRounds ?? DEFAULT_MAX_ROUNDS,
  });
  const channelId = channel.id;

  const state: CLIDebateState = {
    channelId,
    topic: config.topic,
    format: config.format,
    agents: config.agents,
    currentRound: 0,
    maxRounds: config.maxRounds ?? DEFAULT_MAX_ROUNDS,
    status: "active",
    processes: new Map(),
    workingDir: config.workingDir,
  };

  activeCLIDebates.set(channelId, state);

  onMessage({
    type: "debate_started",
    channelId,
    content: `CLI Debate started: ${config.topic}`,
  });

  log.info("CLI debate started", {
    channelId,
    topic: config.topic,
    format: config.format,
    agents: config.agents.map((a) => `${a.label} (${a.platform}/${a.model})`),
  });

  // Run debate loop in background
  runCLIDebateLoop(state, onMessage).catch((err) => {
    log.error("CLI debate loop error", { channelId, error: String(err) });
    state.status = "error";
    onMessage({ type: "debate_error", channelId, content: String(err) });
  });

  return state;
}

async function runCLIDebateLoop(
  state: CLIDebateState,
  onMessage: (msg: { type: string; agentId?: string; round?: number; content?: string; channelId?: string }) => void,
): Promise<void> {
  for (let round = 1; round <= state.maxRounds; round++) {
    if (state.status !== "active") break;

    state.currentRound = round;
    onMessage({
      type: "round_start",
      round,
      channelId: state.channelId,
      content: `Round ${round} of ${state.maxRounds}`,
    });

    // Get previous messages for context
    const previousMessages = getChannelMessages(state.channelId)
      .map((m) => ({ agentId: m.agentId, content: m.content, round: m.round }));

    // Each agent responds sequentially (avoids file conflicts in shared workspace)
    for (const agent of state.agents) {
      if (state.status !== "active") break;

      const opponent = state.agents.find((a) => a.id !== agent.id) ?? state.agents[0]!;

      const prompt = buildDebatePrompt({
        topic: state.topic,
        format: state.format,
        role: agent.role,
        agentLabel: agent.label,
        opponentLabel: opponent!.label,
        opponentPlatform: opponent!.platform,
        previousRounds: previousMessages,
        round,
      });

      onMessage({
        type: "agent_thinking",
        agentId: agent.id,
        round,
        channelId: state.channelId,
        content: `${agent.emoji} ${agent.label} is thinking...`,
      });

      try {
        // Spawn CLI process for this turn
        const adapter = getAdapter(agent.platform);
        const responseChunks: string[] = [];
        const toolNames: string[] = [];

        const proc = await adapter.launch(
          {
            sessionId: `debate-${state.channelId}-${agent.id}-r${round}`,
            cwd: state.workingDir,
            model: agent.model,
            prompt,
            platformOptions: agent.platformOptions,
          },
          (msg: NormalizedMessage) => {
            // Collect response content
            if (msg.type === "assistant" && msg.content) {
              responseChunks.push(msg.content);
            }
            if (msg.contentBlocks) {
              for (const block of msg.contentBlocks) {
                if (block.type === "text") {
                  if (!msg.content) responseChunks.push(block.text);
                } else if (block.type === "tool_use") {
                  toolNames.push(block.name);
                }
              }
            }
          },
          (_exitCode) => { /* handled via proc.exited */ },
        );

        state.processes.set(agent.id, proc);

        // Wait for process to complete (with timeout)
        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            if (proc.isAlive()) {
              log.warn("CLI debate agent timed out", { agentId: agent.id, round });
              proc.kill();
            }
            resolve();
          }, RESPONSE_TIMEOUT_MS);
        });

        await Promise.race([proc.exited, timeoutPromise]);
        state.processes.delete(agent.id);

        // Assemble response
        let responseText = responseChunks.join("");
        if (responseText.length > MAX_RESPONSE_LENGTH) {
          responseText = responseText.slice(0, MAX_RESPONSE_LENGTH) + "\n\n[Response truncated]";
        }

        if (!responseText.trim()) {
          responseText = `[${agent.label} did not produce a response]`;
        }

        // Add tool use summary if any
        if (toolNames.length > 0) {
          const uniqueTools = [...new Set(toolNames)];
          responseText += `\n\n---\n*Tools used: ${uniqueTools.join(", ")}*`;
        }

        // Store in channel
        postMessage({
          channelId: state.channelId,
          agentId: agent.id,
          role: agent.role,
          content: responseText,
          round,
        });

        onMessage({
          type: "agent_response",
          agentId: agent.id,
          round,
          channelId: state.channelId,
          content: responseText,
        });

        log.info("CLI debate agent responded", {
          channelId: state.channelId,
          agentId: agent.id,
          platform: agent.platform,
          round,
          responseLength: responseText.length,
          toolsUsed: toolNames.length,
        });
      } catch (err) {
        log.error("CLI debate agent failed", {
          channelId: state.channelId,
          agentId: agent.id,
          round,
          error: String(err),
        });

        // Post forfeit message
        postMessage({
          channelId: state.channelId,
          agentId: agent.id,
          role: agent.role,
          content: `[${agent.label} encountered an error: ${String(err)}]`,
          round,
        });

        onMessage({
          type: "agent_error",
          agentId: agent.id,
          round,
          channelId: state.channelId,
          content: `${agent.label} failed: ${String(err)}`,
        });
      }
    }

    onMessage({
      type: "round_end",
      round,
      channelId: state.channelId,
    });
  }

  // Conclude debate
  if (state.status === "active") {
    state.status = "concluded";

    const db = getDb();
    db.update(channels)
      .set({ status: "concluded", concludedAt: new Date() })
      .where(eq(channels.id, state.channelId))
      .run();

    onMessage({
      type: "debate_concluded",
      channelId: state.channelId,
      content: `CLI Debate concluded after ${state.currentRound} rounds`,
    });

    log.info("CLI debate concluded", {
      channelId: state.channelId,
      rounds: state.currentRound,
    });
  }

  activeCLIDebates.delete(state.channelId);
}

/**
 * Abort an active CLI debate — kills all processes and concludes.
 */
export function abortCLIDebate(channelId: string): boolean {
  const state = activeCLIDebates.get(channelId);
  if (!state) return false;

  state.status = "concluded";

  // Kill all active CLI processes
  for (const [agentId, proc] of state.processes) {
    try {
      proc.kill();
      log.info("Killed CLI debate process", { channelId, agentId });
    } catch {
      // already dead
    }
  }
  state.processes.clear();

  const db = getDb();
  db.update(channels)
    .set({ status: "concluded", concludedAt: new Date() })
    .where(eq(channels.id, channelId))
    .run();

  activeCLIDebates.delete(channelId);

  log.info("CLI debate aborted", { channelId });
  return true;
}
