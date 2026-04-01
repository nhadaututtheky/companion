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
import { callAI, callAIWithModel, getOpenRouterConfig, type ModelTier } from "./ai-client.js";
import { createLogger } from "../logger.js";

const log = createLogger("debate-engine");

const DEFAULT_MAX_ROUNDS = 5;
const DEFAULT_MAX_COST_USD = 0.5;

// ── Types ──────────────────────────────────────────────────────────────────

export type DebateFormat = "pro_con" | "red_team" | "review" | "brainstorm";

/** Per-agent model override for multi-model debates (API-facing, no secrets) */
export interface AgentModelConfig {
  /** Agent slot ID (e.g. "advocate", "challenger", "builder", "attacker") */
  agentId: string;
  /** Full model ID — OpenRouter format with "/" (e.g. "openai/gpt-4o") or plain model name */
  model: string;
  /** Display label for UI (e.g. "GPT-4o", "Claude Sonnet") */
  label?: string;
}

export interface DebateConfig {
  topic: string;
  format: DebateFormat;
  projectSlug?: string;
  maxRounds?: number;
  maxCostUsd?: number;
  /** Per-agent model assignments for multi-model debates */
  agentModels?: AgentModelConfig[];
}

export interface DebateAgent {
  id: string;
  role: string;
  label: string;
  emoji: string;
  systemPrompt: string;
  /** Explicit model for this agent (multi-model debate) */
  model?: string;
  /** Display label for the model (e.g. "GPT-4o") */
  modelLabel?: string;
  /** Provider override for this agent's model */
  providerOverride?: {
    provider: "anthropic" | "openai-compatible";
    baseUrl: string;
    apiKey: string;
  };
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
  /** Consecutive rounds with no new points (for stale detection) */
  staleRoundCount: number;
  status: "active" | "concluding" | "concluded";
  /** Coordinator scratchpad — accumulated key points per round (caps at ~2000 tokens) */
  scratchpad: string;
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

// ── AI helper ─────────────────────────────────────────────────────────────

async function callDebateAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  tier: ModelTier = "strong",
  agent?: DebateAgent,
): Promise<{ text: string; costUsd: number }> {
  // If agent has an explicit model, use callAIWithModel
  if (agent?.model) {
    const res = await callAIWithModel({
      systemPrompt,
      messages,
      model: agent.model,
      maxTokens: 1024,
      providerOverride: agent.providerOverride,
    });
    return { text: res.text, costUsd: res.costUsd };
  }

  // Default: tier-based routing
  const res = await callAI({
    systemPrompt,
    messages,
    tier,
    maxTokens: 1024,
  });
  return { text: res.text, costUsd: res.costUsd };
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

  // Apply per-agent model overrides (immutable)
  if (config.agentModels && config.agentModels.length > 0) {
    // Resolve OpenRouter config once for all agents that need it
    const openRouterCfg = getOpenRouterConfig();

    for (let i = 0; i < agents.length; i++) {
      const modelCfg = config.agentModels.find((m) => m.agentId === agents[i]!.id);
      if (!modelCfg) continue;

      // Determine provider: models with "/" prefix are OpenRouter format
      const needsOpenRouter = modelCfg.model.includes("/");
      if (needsOpenRouter && !openRouterCfg) {
        log.warn("Agent model requires OpenRouter but no config found, using default", {
          agentId: modelCfg.agentId,
          model: modelCfg.model,
        });
        continue;
      }

      agents[i] = {
        ...agents[i]!,
        model: modelCfg.model,
        modelLabel: modelCfg.label,
        providerOverride: needsOpenRouter ? openRouterCfg : undefined,
      };
    }
  }

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
    staleRoundCount: 0,
    status: "active",
    scratchpad: "",
  };

  activeDebates.set(channel.id, state);

  log.info("Debate started", {
    channelId: channel.id,
    topic: config.topic,
    format: config.format,
    agents: agents.map((a) => `${a.label}${a.model ? ` [${a.modelLabel ?? a.model}]` : ""}`),
  });

  // Run first round (non-blocking)
  void runDebateLoop(state, onMessage);

  return state;
}

/**
 * Main debate loop — runs rounds until convergence, max rounds, or cost limit.
 */
async function runDebateLoop(
  state: DebateState,
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

      // All agents respond in parallel for faster debates
      if (state.status !== "active") break;

      const agentResults = await Promise.all(
        state.agents.map(async (agent) => {
          const conversationMessages = buildConversation(
            history,
            agent,
            state.currentRound,
            state.scratchpad || undefined,
          );
          const { text, costUsd } = await callDebateAI(
            agent.systemPrompt,
            conversationMessages,
            "strong",
            agent,
          );
          return { agent, text, costUsd };
        }),
      );

      for (const { agent, text, costUsd } of agentResults) {
        if (state.status !== "active") break;

        state.totalCostUsd += costUsd;

        postMessage({
          channelId: state.channelId,
          agentId: agent.id,
          role: agent.role,
          content: text,
          round: state.currentRound,
        });

        onMessage?.(state.channelId, agent, text, state.currentRound);

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

      // Coordinator synthesis: extract key points from this round into scratchpad
      try {
        const roundMsgs = agentResults.map((r) => ({ agent: r.agent, text: r.text }));
        state.scratchpad = await coordinatorSynthesize(state, roundMsgs);
        log.debug("Coordinator scratchpad updated", {
          channelId: state.channelId,
          round: state.currentRound,
          scratchpadLength: state.scratchpad.length,
        });
      } catch (err) {
        log.warn("Coordinator synthesis failed (non-fatal)", { error: String(err) });
      }

      // Convergence check (skip round 1 — need at least 2 rounds)
      if (state.currentRound >= 2) {
        const convergenceResult = await checkConvergence(state.channelId, state.currentRound);

        // Accumulate stale rounds across calls
        if (convergenceResult.staleRounds > 0) {
          state.staleRoundCount++;
        } else {
          state.staleRoundCount = 0;
        }

        const shouldConclude = convergenceResult.score >= 70 || state.staleRoundCount >= 2;

        if (shouldConclude) {
          log.info("Debate converged", {
            channelId: state.channelId,
            score: convergenceResult.score,
            staleRounds: state.staleRoundCount,
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
    activeDebates.delete(state.channelId);
  }
}

/**
 * Build conversation messages for an agent from channel history.
 * Uses <task-notification> XML format for structured context (CC Coordinator pattern).
 * Includes scratchpad for accumulated key points when available.
 */
function buildConversation(
  history: Array<{ agentId: string; role: string; content: string; round: number }>,
  agent: DebateAgent,
  currentRound: number,
  scratchpad?: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  // Inject scratchpad as context if available (from round 2+)
  if (scratchpad) {
    messages.push({
      role: "user",
      content: `<coordinator-scratchpad>\n${scratchpad}\n</coordinator-scratchpad>\n\nAbove is the coordinator's summary of key points so far. Build on these — don't repeat arguments already noted.`,
    });
    // Need a placeholder assistant response to keep alternation valid
    messages.push({
      role: "assistant",
      content: "Understood. I'll build on the accumulated points and bring new arguments.",
    });
  }

  // Present previous messages as task-notification XML
  for (const msg of history) {
    if (msg.agentId === agent.id) {
      // Agent's own messages = assistant
      messages.push({ role: "assistant", content: msg.content });
    } else {
      // Other agents' messages = user (opponent), wrapped in task-notification XML
      messages.push({
        role: "user",
        content: `<task-notification agent="${msg.role}" round="${msg.round}">\n${msg.content}\n</task-notification>`,
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
        content: `Round ${currentRound} — respond to the previous arguments and advance your position.`,
      });
    }
  }

  return messages;
}

// ── Coordinator Synthesis ──────────────────────────────────────────────────

/**
 * Coordinator synthesis: after each round, summarize progress and extract key points.
 * Inspired by Claude Code Coordinator Mode — "never delegate understanding".
 * The scratchpad accumulates across rounds, capped to ~2000 chars to prevent context bloat.
 */
async function coordinatorSynthesize(
  state: DebateState,
  roundMessages: Array<{ agent: DebateAgent; text: string }>,
): Promise<string> {
  const agentLabels = state.agents.map((a) => `${a.emoji} ${a.label}`).join(" vs ");
  const roundSummary = roundMessages
    .map(
      (m) =>
        `<task-notification agent="${m.agent.label}" round="${state.currentRound}">\n${m.text}\n</task-notification>`,
    )
    .join("\n\n");

  const { text } = await callDebateAI(
    `You are the COORDINATOR synthesizing Round ${state.currentRound} of a debate.
Topic: "${state.topic}" | Agents: ${agentLabels}

Your job: Extract the 3-5 most important NEW points from this round. Be concise.
${state.scratchpad ? `\nPrevious rounds scratchpad:\n${state.scratchpad}` : ""}

Rules:
- Only list genuinely new arguments or evidence (skip rehashed points)
- Format: bullet points, max 1 sentence each
- If agents are converging, note what they agree on
- Max 5 bullet points`,
    [{ role: "user", content: roundSummary }],
    "fast",
  );

  // Append to scratchpad, cap at ~2000 chars
  const newEntry = `\n## Round ${state.currentRound}\n${text.trim()}`;
  let updated = state.scratchpad + newEntry;
  if (updated.length > 2000) {
    // Keep only recent rounds (trim from front)
    const lines = updated.split("\n");
    while (updated.length > 2000 && lines.length > 5) {
      lines.shift();
      updated = lines.join("\n");
    }
  }

  return updated;
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

/**
 * Generate verdict using independent verification pattern (CC Coordinator Mode).
 * Judge gets scratchpad + last round only — NOT the full transcript.
 * This prevents the judge from inheriting implementation assumptions.
 */
async function generateVerdict(
  state: DebateState,
  history: Array<{ agentId: string; role: string; content: string; round: number }>,
): Promise<Verdict> {
  const agentLabels = state.agents.map((a) => `${a.emoji} ${a.label} (${a.role})`).join(", ");

  // Independent verification: use scratchpad (coordinator summary) + last round only
  // This prevents the judge from being biased by rhetorical style of earlier rounds
  const lastRound = history.filter((m) => m.round === state.currentRound);
  const lastRoundText = lastRound
    .map(
      (m) =>
        `<task-notification agent="${m.role}" round="${m.round}">\n${m.content}\n</task-notification>`,
    )
    .join("\n\n");

  const judgeContext = state.scratchpad
    ? `<coordinator-scratchpad>\n${state.scratchpad}\n</coordinator-scratchpad>\n\n--- Final Round ---\n\n${lastRoundText}`
    : history.map((m) => `[${m.role.toUpperCase()} R${m.round}]: ${m.content}`).join("\n\n---\n\n");

  const { text } = await callDebateAI(
    `You are an INDEPENDENT JUDGE evaluating a ${state.currentRound}-round debate.
Agents: ${agentLabels}. Topic: "${state.topic}".

You receive a coordinator's summary of all rounds plus the final round transcript.
Judge based on argument quality and evidence, NOT rhetorical style.

Produce a JSON verdict:
{
  "winner": "which role had the stronger argument (or 'draw')",
  "recommendation": "1-2 sentence practical recommendation",
  "agreementPoints": ["points both sides agree on"],
  "keyArguments": { "advocate": ["best points"], "challenger": ["best points"] },
  "unresolvedPoints": ["points that need more analysis"],
  "confidenceScore": 0-100
}

Respond ONLY with valid JSON.`,
    [{ role: "user", content: judgeContext }],
    "fast",
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
