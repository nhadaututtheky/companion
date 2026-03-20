/**
 * Debate Engine — Orchestrates multi-agent debates via Anthropic API.
 *
 * Agents are API-driven (not CLI sessions) — cheaper, faster, simpler.
 * Each agent = an Anthropic API call with a role-specific system prompt.
 * Messages are stored in channel_messages for history + Telegram routing.
 */

import {
  createChannel,
  postMessage,
  getChannelMessages,
  updateChannelStatus,
  type ChannelType,
} from "./channel-manager.js";
import { checkConvergence } from "./convergence-detector.js";
import { getDb } from "../db/client.js";
import { channels } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createLogger } from "../logger.js";

const log = createLogger("debate-engine");

const SONNET_MODEL = "claude-sonnet-4-6-20250514";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_ROUNDS = 5;
const DEFAULT_MAX_COST_USD = 0.50;

// ── Types ──────────────────────────────────────────────────────────────────

export type DebateFormat = "pro_con" | "red_team" | "review" | "brainstorm";

export interface DebateConfig {
  topic: string;
  format: DebateFormat;
  projectSlug?: string;
  maxRounds?: number;
  maxCostUsd?: number;
  /** Model for debate agents (default: sonnet) */
  agentModel?: string;
}

export interface DebateAgent {
  id: string;
  role: string;
  label: string;
  emoji: string;
  systemPrompt: string;
}

export interface DebateState {
  channelId: string;
  topic: string;
  format: DebateFormat;
  agents: DebateAgent[];
  currentRound: number;
  maxRounds: number;
  maxCostUsd: number;
  totalCostUsd: number;
  status: "active" | "concluding" | "concluded";
}

export interface Verdict {
  winner: string;
  recommendation: string;
  agreementPoints: string[];
  keyArguments: Record<string, string[]>;
  unresolvedPoints: string[];
  confidenceScore: number;
}

// ── Active debates (in-memory tracking) ────────────────────────────────────

const activeDebates = new Map<string, DebateState>();

export function getActiveDebate(channelId: string): DebateState | undefined {
  return activeDebates.get(channelId);
}

export function getActiveDebateByProject(projectSlug: string): DebateState | undefined {
  for (const debate of activeDebates.values()) {
    if (debate.status === "active") {
      // Check DB for projectSlug match
      const db = getDb();
      const ch = db.select().from(channels).where(eq(channels.id, debate.channelId)).get();
      if (ch?.projectSlug === projectSlug) return debate;
    }
  }
  return undefined;
}

export function listActiveDebates(): DebateState[] {
  return [...activeDebates.values()].filter((d) => d.status === "active");
}

// ── Format definitions ────────────────────────────────────────────────────

function getAgentsForFormat(format: DebateFormat, topic: string): DebateAgent[] {
  switch (format) {
    case "pro_con":
      return [
        {
          id: "advocate",
          role: "advocate",
          label: "Advocate",
          emoji: "🔵",
          systemPrompt: `You are the ADVOCATE in a structured debate about: "${topic}"

Your job is to argue FOR the proposition. Be specific, use evidence, and anticipate counterarguments.

Rules:
- Keep responses concise (200-400 words)
- Address the opponent's previous points directly
- Bring new evidence or perspectives each round
- Be persuasive but intellectually honest
- Format: Start with your main point, then supporting arguments`,
        },
        {
          id: "challenger",
          role: "challenger",
          label: "Challenger",
          emoji: "🔴",
          systemPrompt: `You are the CHALLENGER in a structured debate about: "${topic}"

Your job is to argue AGAINST the proposition or present the alternative perspective. Challenge assumptions, find weaknesses.

Rules:
- Keep responses concise (200-400 words)
- Address the opponent's previous points directly
- Bring new evidence or perspectives each round
- Be persuasive but intellectually honest
- Format: Start with your main counterpoint, then supporting arguments`,
        },
      ];

    case "red_team":
      return [
        {
          id: "builder",
          role: "advocate",
          label: "Builder",
          emoji: "🟢",
          systemPrompt: `You are the BUILDER defending a system/approach about: "${topic}"

Explain the design, its strengths, and why it's the right approach. Address security, performance, and reliability.

Rules:
- Keep responses concise (200-400 words)
- Be specific about implementation details
- Address the attacker's concerns directly
- Propose mitigations for valid concerns`,
        },
        {
          id: "attacker",
          role: "challenger",
          label: "Attacker",
          emoji: "🔴",
          systemPrompt: `You are the RED TEAM ATTACKER analyzing: "${topic}"

Find security vulnerabilities, edge cases, failure modes, scalability issues, and design flaws.

Rules:
- Keep responses concise (200-400 words)
- Be specific about attack vectors
- Rate severity of each finding (Critical/High/Medium/Low)
- Suggest how to verify each finding`,
        },
      ];

    case "review":
      return [
        {
          id: "author",
          role: "advocate",
          label: "Author",
          emoji: "🔵",
          systemPrompt: `You are the AUTHOR presenting work for review: "${topic}"

Explain your approach, design decisions, and trade-offs. Defend your choices when challenged, but be open to improvement.

Rules:
- Keep responses concise (200-400 words)
- Be specific about why you made certain choices
- Acknowledge valid criticism and propose improvements`,
        },
        {
          id: "reviewer",
          role: "challenger",
          label: "Reviewer",
          emoji: "🟡",
          systemPrompt: `You are a SENIOR CODE REVIEWER examining: "${topic}"

Review for correctness, maintainability, performance, security, and best practices. Be constructive.

Rules:
- Keep responses concise (200-400 words)
- Categorize feedback: Must Fix, Should Fix, Suggestion, Praise
- Be specific with line references or code examples when possible
- Acknowledge good patterns alongside issues`,
        },
      ];

    case "brainstorm":
      return [
        {
          id: "creative",
          role: "advocate",
          label: "Creative",
          emoji: "🟣",
          systemPrompt: `You are the CREATIVE THINKER brainstorming about: "${topic}"

Generate bold, innovative ideas. Think outside the box. Explore unconventional approaches.

Rules:
- Keep responses concise (200-400 words)
- Present 2-3 distinct ideas per round
- Build on previous ideas from all participants
- Don't self-censor — wild ideas welcome`,
        },
        {
          id: "practical",
          role: "challenger",
          label: "Pragmatist",
          emoji: "🟠",
          systemPrompt: `You are the PRAGMATIST in a brainstorm about: "${topic}"

Evaluate ideas for feasibility, cost, timeline, and risks. Refine wild ideas into actionable plans.

Rules:
- Keep responses concise (200-400 words)
- Rate feasibility of each idea (Easy/Medium/Hard/Moonshot)
- Suggest concrete first steps for promising ideas
- Build on others' ideas with practical improvements`,
        },
      ];
  }
}

// ── Anthropic API helper ──────────────────────────────────────────────────

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

async function callAnthropic(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model?: string,
): Promise<{ text: string; costUsd: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model ?? SONNET_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  const text = data.content?.[0]?.text ?? "";

  // Rough cost estimate (Sonnet pricing)
  const inputCost = (data.usage.input_tokens / 1_000_000) * 3;
  const outputCost = (data.usage.output_tokens / 1_000_000) * 15;
  const costUsd = inputCost + outputCost;

  return { text, costUsd };
}

// ── Core Engine ────────────────────────────────────────────────────────────

/**
 * Start a new debate. Creates channel, sets up agents, runs first round.
 * Returns the debate state (channel ID for tracking).
 */
export async function startDebate(
  config: DebateConfig,
  onMessage?: (channelId: string, agent: DebateAgent, content: string, round: number) => void,
): Promise<DebateState> {
  const agents = getAgentsForFormat(config.format, config.topic);

  // Create channel in DB
  const channel = createChannel({
    projectSlug: config.projectSlug,
    type: config.format as ChannelType,
    topic: config.topic,
    maxRounds: config.maxRounds ?? DEFAULT_MAX_ROUNDS,
  });

  const state: DebateState = {
    channelId: channel.id,
    topic: config.topic,
    format: config.format,
    agents,
    currentRound: 0,
    maxRounds: config.maxRounds ?? DEFAULT_MAX_ROUNDS,
    maxCostUsd: config.maxCostUsd ?? DEFAULT_MAX_COST_USD,
    totalCostUsd: 0,
    status: "active",
  };

  activeDebates.set(channel.id, state);

  log.info("Debate started", {
    channelId: channel.id,
    topic: config.topic,
    format: config.format,
    agents: agents.map((a) => a.label),
  });

  // Run first round (non-blocking)
  void runDebateLoop(state, config.agentModel, onMessage);

  return state;
}

/**
 * Main debate loop — runs rounds until convergence, max rounds, or cost limit.
 */
async function runDebateLoop(
  state: DebateState,
  agentModel?: string,
  onMessage?: (channelId: string, agent: DebateAgent, content: string, round: number) => void,
): Promise<void> {
  try {
    while (state.status === "active" && state.currentRound < state.maxRounds) {
      state.currentRound++;

      // Update DB
      const db = getDb();
      db.update(channels)
        .set({ currentRound: state.currentRound })
        .where(eq(channels.id, state.channelId))
        .run();

      // Get channel history for context
      const history = getChannelMessages(state.channelId, 100);

      // Each agent takes a turn
      for (const agent of state.agents) {
        if (state.status !== "active") break;

        // Build conversation from channel history
        const conversationMessages = buildConversation(history, agent, state.currentRound);

        const { text, costUsd } = await callAnthropic(
          agent.systemPrompt,
          conversationMessages,
          agentModel,
        );

        state.totalCostUsd += costUsd;

        // Store in channel
        postMessage({
          channelId: state.channelId,
          agentId: agent.id,
          role: agent.role,
          content: text,
          round: state.currentRound,
        });

        // Notify callback (for Telegram routing)
        onMessage?.(state.channelId, agent, text, state.currentRound);

        // Cost guard
        if (state.totalCostUsd >= state.maxCostUsd) {
          log.info("Debate cost limit reached", {
            channelId: state.channelId,
            cost: state.totalCostUsd,
          });
          break;
        }
      }

      // Cost limit check
      if (state.totalCostUsd >= state.maxCostUsd) {
        await concludeDebate(state.channelId, onMessage);
        return;
      }

      // Convergence check (skip round 1 — need at least 2 rounds)
      if (state.currentRound >= 2) {
        const convergenceResult = await checkConvergence(state.channelId, state.currentRound);
        if (convergenceResult.converged) {
          log.info("Debate converged", {
            channelId: state.channelId,
            score: convergenceResult.score,
            round: state.currentRound,
          });
          await concludeDebate(state.channelId, onMessage);
          return;
        }
      }
    }

    // Max rounds reached
    if (state.status === "active") {
      await concludeDebate(state.channelId, onMessage);
    }
  } catch (err) {
    log.error("Debate loop error", { channelId: state.channelId, error: String(err) });
    state.status = "concluded";
    updateChannelStatus(state.channelId, "concluded");
  }
}

/**
 * Build conversation messages for an agent from channel history.
 */
function buildConversation(
  history: Array<{ agentId: string; role: string; content: string; round: number }>,
  agent: DebateAgent,
  currentRound: number,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Present previous messages as conversation
  for (const msg of history) {
    if (msg.agentId === agent.id) {
      // Agent's own messages = assistant
      messages.push({ role: "assistant", content: msg.content });
    } else {
      // Other agents' messages = user (opponent)
      messages.push({
        role: "user",
        content: `[${msg.role.toUpperCase()} — Round ${msg.round}]: ${msg.content}`,
      });
    }
  }

  // If no messages yet (round 1), prompt the agent to start
  if (messages.length === 0) {
    messages.push({
      role: "user",
      content: `This is Round ${currentRound}. Present your opening argument.`,
    });
  } else {
    // Ensure the last message is from "user" (opponent) so agent can respond
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant") {
      messages.push({
        role: "user",
        content: `Round ${currentRound} — please respond to the previous arguments and advance your position.`,
      });
    }
  }

  return messages;
}

// ── Conclude & Verdict ─────────────────────────────────────────────────────

/**
 * Force-conclude a debate and generate verdict.
 */
export async function concludeDebate(
  channelId: string,
  onMessage?: (channelId: string, agent: DebateAgent, content: string, round: number) => void,
): Promise<Verdict | null> {
  const state = activeDebates.get(channelId);
  if (!state) return null;

  state.status = "concluding";
  updateChannelStatus(channelId, "concluding");

  try {
    const history = getChannelMessages(channelId, 100);
    const verdict = await generateVerdict(state, history);

    // Store verdict in DB
    const db = getDb();
    db.update(channels)
      .set({
        verdict: verdict as unknown as Record<string, unknown>,
        status: "concluded",
        concludedAt: new Date(),
      })
      .where(eq(channels.id, channelId))
      .run();

    // Post verdict as judge message
    const verdictText = formatVerdictText(verdict);
    postMessage({
      channelId,
      agentId: "judge",
      role: "judge",
      content: verdictText,
      round: state.currentRound + 1,
    });

    // Notify callback
    const judgeAgent: DebateAgent = {
      id: "judge",
      role: "judge",
      label: "Judge",
      emoji: "⚖️",
      systemPrompt: "",
    };
    onMessage?.(channelId, judgeAgent, verdictText, state.currentRound + 1);

    state.status = "concluded";
    activeDebates.delete(channelId);

    log.info("Debate concluded", {
      channelId,
      rounds: state.currentRound,
      cost: state.totalCostUsd.toFixed(4),
      winner: verdict.winner,
      confidence: verdict.confidenceScore,
    });

    return verdict;
  } catch (err) {
    log.error("Failed to generate verdict", { channelId, error: String(err) });
    state.status = "concluded";
    updateChannelStatus(channelId, "concluded");
    activeDebates.delete(channelId);
    return null;
  }
}

async function generateVerdict(
  state: DebateState,
  history: Array<{ agentId: string; role: string; content: string; round: number }>,
): Promise<Verdict> {
  const transcript = history
    .map((m) => `[${m.role.toUpperCase()} R${m.round}]: ${m.content}`)
    .join("\n\n---\n\n");

  const agentLabels = state.agents.map((a) => `${a.emoji} ${a.label} (${a.role})`).join(", ");

  const { text } = await callAnthropic(
    `You are the JUDGE in a structured debate. Agents: ${agentLabels}. Topic: "${state.topic}".

Analyze the full debate transcript and produce a JSON verdict:
{
  "winner": "which role had the stronger argument (or 'draw')",
  "recommendation": "1-2 sentence practical recommendation",
  "agreementPoints": ["points both sides agree on"],
  "keyArguments": { "advocate": ["best points"], "challenger": ["best points"] },
  "unresolvedPoints": ["points that need more analysis"],
  "confidenceScore": 0-100
}

Respond ONLY with valid JSON.`,
    [{ role: "user", content: transcript }],
    HAIKU_MODEL, // Judge uses Haiku (cheaper)
  );

  try {
    return JSON.parse(text) as Verdict;
  } catch {
    return {
      winner: "draw",
      recommendation: text.slice(0, 200),
      agreementPoints: [],
      keyArguments: {},
      unresolvedPoints: ["Failed to parse structured verdict"],
      confidenceScore: 50,
    };
  }
}

function formatVerdictText(verdict: Verdict): string {
  const lines: string[] = [
    `⚖️ VERDICT`,
    ``,
    `Winner: ${verdict.winner}`,
    `Recommendation: ${verdict.recommendation}`,
    `Confidence: ${verdict.confidenceScore}/100`,
  ];

  if (verdict.agreementPoints.length > 0) {
    lines.push("", "Agreement Points:");
    verdict.agreementPoints.forEach((p) => lines.push(`  • ${p}`));
  }

  if (verdict.unresolvedPoints.length > 0) {
    lines.push("", "Unresolved:");
    verdict.unresolvedPoints.forEach((p) => lines.push(`  • ${p}`));
  }

  return lines.join("\n");
}

/**
 * Inject a human message into an active debate.
 */
export function injectHumanMessage(channelId: string, content: string): boolean {
  const state = activeDebates.get(channelId);
  if (!state || state.status !== "active") return false;

  postMessage({
    channelId,
    agentId: "human",
    role: "human",
    content,
    round: state.currentRound,
  });

  return true;
}
