/**
 * MentionRouter — Parse @mentions in user messages and route to target sessions.
 *
 * When a user types "@fox what do you think about this approach?",
 * the mention router:
 * 1. Extracts @fox from the message
 * 2. Resolves "fox" → session ID
 * 3. Forwards the message to that session with context about who's asking
 * 4. Routes the response back to the original session's channel
 *
 * This creates organic cross-session debates without formal "debate mode".
 */

import { resolveShortId } from "./short-id.js";
import { getActiveSession } from "./session-store.js";
import { listActiveDebates, injectHumanMessage } from "./debate-engine.js";
import {
  getWorkspaceForSession,
  getConnectedSession,
  getWorkspaceCliConnections,
} from "./workspace-store.js";
import type { CLIPlatform } from "@companion/shared";
import { createLogger } from "../logger.js";

const log = createLogger("mention-router");

/** CLI platform aliases — @claude, @codex, @gemini, @opencode */
const CLI_ALIASES: Record<string, CLIPlatform> = {
  claude: "claude",
  claudecode: "claude",
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini",
  "gemini-cli": "gemini",
  opencode: "opencode",
  "open-code": "opencode",
};

const ALL_ALIAS = "all";

/** Pattern string for @shortId mentions — create new RegExp per use to avoid stale lastIndex */
const MENTION_PATTERN = "@([a-z][a-z0-9-]*)";

function createMentionRegex(): RegExp {
  return new RegExp(MENTION_PATTERN, "gi");
}

/**
 * Resolve a @mention as a CLI platform within the sender's workspace.
 * Returns session ID of the connected CLI, or null if not in workspace / not connected.
 */
function resolveCliMention(
  alias: string,
  fromSessionId: string,
): { sessionId: string; platform: CLIPlatform } | null {
  const platform = CLI_ALIASES[alias.toLowerCase()];
  if (!platform) return null;

  const wsId = getWorkspaceForSession(fromSessionId);
  if (!wsId) return null;

  const sessionId = getConnectedSession(wsId, platform);
  if (!sessionId || sessionId === fromSessionId) return null;

  const target = getActiveSession(sessionId);
  if (!target) return null;

  return { sessionId, platform };
}

/**
 * Resolve @all — returns all connected CLI sessions in the sender's workspace.
 * Uses in-memory cliConnections map (no DB hit).
 */
function resolveAllMention(
  fromSessionId: string,
): Array<{ sessionId: string; platform: CLIPlatform }> {
  const wsId = getWorkspaceForSession(fromSessionId);
  if (!wsId) return [];

  const connections = getWorkspaceCliConnections(wsId);
  if (!connections) return [];

  const results: Array<{ sessionId: string; platform: CLIPlatform }> = [];
  for (const [platform, sessionId] of connections) {
    if (sessionId && sessionId !== fromSessionId) {
      const target = getActiveSession(sessionId);
      if (target) {
        results.push({ sessionId, platform });
      }
    }
  }
  return results;
}

export interface ParsedMention {
  shortId: string;
  sessionId: string;
  /** Start index in original message */
  start: number;
  /** End index in original message */
  end: number;
  /** If this mention targets a debate channel instead of a session */
  debateChannelId?: string;
  /** CLI platform if resolved as workspace CLI mention */
  cliPlatform?: CLIPlatform;
  /** True if this is an @all fan-out mention */
  isAllFanout?: boolean;
}

export interface MentionContext {
  /** The original message with mentions */
  originalMessage: string;
  /** Session that sent the message */
  fromSessionId: string;
  fromShortId: string;
  /** Resolved mentions */
  mentions: ParsedMention[];
  /** Message with mentions stripped (clean text for target sessions) */
  cleanMessage: string;
}

/**
 * Parse @mentions from a message and resolve them to session IDs.
 * Returns null if no valid mentions found.
 */
export function parseMentions(
  message: string,
  fromSessionId: string,
  fromShortId: string,
): MentionContext | null {
  const mentions: ParsedMention[] = [];
  const regex = createMentionRegex();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(message)) !== null) {
    const shortId = match[1]!.toLowerCase();
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;

    // Priority 1: @all — fan-out to all workspace CLIs
    if (shortId === ALL_ALIAS) {
      const allClis = resolveAllMention(fromSessionId);
      for (const { sessionId, platform } of allClis) {
        mentions.push({
          shortId: platform,
          sessionId,
          start: matchStart,
          end: matchEnd,
          cliPlatform: platform,
          isAllFanout: true,
        });
      }
      continue;
    }

    // Priority 2: @cli-type — workspace CLI routing
    const cliMatch = resolveCliMention(shortId, fromSessionId);
    if (cliMatch) {
      mentions.push({
        shortId,
        sessionId: cliMatch.sessionId,
        start: matchStart,
        end: matchEnd,
        cliPlatform: cliMatch.platform,
      });
      continue;
    }

    // Priority 3: @session-shortid
    const sessionId = resolveShortId(shortId);
    if (sessionId) {
      if (sessionId === fromSessionId) continue;
      const target = getActiveSession(sessionId);
      if (!target) {
        log.debug("Mentioned session not active", { shortId, sessionId });
        continue;
      }
      mentions.push({ shortId, sessionId, start: matchStart, end: matchEnd });
      continue;
    }

    // Priority 4: debate agent alias
    const debateMatch = resolveDebateAgentMention(shortId);
    if (debateMatch) {
      mentions.push({
        shortId,
        sessionId: `debate:${debateMatch.channelId}`,
        debateChannelId: debateMatch.channelId,
        start: matchStart,
        end: matchEnd,
      });
    } else {
      log.debug("Unresolved mention", { shortId });
    }
  }

  if (mentions.length === 0) return null;

  // Remove duplicate mentions (same session mentioned multiple times)
  const unique = mentions.filter(
    (m, i, arr) => arr.findIndex((x) => x.sessionId === m.sessionId) === i,
  );

  // Build clean message — strip unique positions (dedup by position for @all which shares one range)
  let cleanMessage = message;
  const seenPositions = new Set<number>();
  const sortedByPos = [...unique].sort((a, b) => b.start - a.start);
  for (const m of sortedByPos) {
    if (seenPositions.has(m.start)) continue;
    seenPositions.add(m.start);
    cleanMessage = cleanMessage.slice(0, m.start) + cleanMessage.slice(m.end);
  }
  cleanMessage = cleanMessage.replace(/\s+/g, " ").trim();

  return {
    originalMessage: message,
    fromSessionId,
    fromShortId,
    mentions: unique,
    cleanMessage,
  };
}

/**
 * Resolve a mention as a debate agent ID.
 * Checks active debates for matching agent IDs (e.g. "advocate", "challenger").
 */
function resolveDebateAgentMention(shortId: string): { channelId: string; agentId: string } | null {
  const debates = listActiveDebates();
  for (const debate of debates) {
    const agent = debate.agents.find((a) => a.id === shortId);
    if (agent) {
      return { channelId: debate.channelId, agentId: agent.id };
    }
  }
  return null;
}

/**
 * Route a mention to the target session.
 * Sends a contextualized message to the target session's CLI.
 * The injected prompt deliberately avoids @shortId syntax to prevent recursive routing.
 */
function routeMention(
  ctx: MentionContext,
  mention: ParsedMention,
  sendToSession: (sessionId: string, content: string) => void,
): void {
  // Handle debate channel mentions — inject as human message into the debate
  if (mention.debateChannelId) {
    const injected = injectHumanMessage(mention.debateChannelId, ctx.cleanMessage);
    if (injected) {
      log.info("Routed mention to debate", {
        from: ctx.fromShortId,
        channelId: mention.debateChannelId,
      });
    }
    return;
  }

  const target = getActiveSession(mention.sessionId);
  if (!target) return;

  const identity = mention.cliPlatform
    ? `You are ${mention.cliPlatform} CLI agent`
    : `You are session "${mention.shortId}"`;

  const context = mention.isAllFanout
    ? `[Workspace @all broadcast from session "${ctx.fromShortId}"]`
    : mention.cliPlatform
      ? `[Workspace @${mention.cliPlatform} mention from session "${ctx.fromShortId}"]`
      : `[Cross-session mention from session "${ctx.fromShortId}"]`;

  const prompt = [
    context,
    ``,
    ctx.cleanMessage,
    ``,
    `---`,
    `Reply naturally. Your response will be shared back with session "${ctx.fromShortId}".`,
    `${identity}. Keep your response concise and focused.`,
  ].join("\n");

  log.info("Routing mention", {
    from: ctx.fromShortId,
    to: mention.shortId,
    targetSessionId: mention.sessionId,
    cliPlatform: mention.cliPlatform,
    isAllFanout: mention.isAllFanout,
  });

  sendToSession(mention.sessionId, prompt);
}

/**
 * Handle all mentions in a message — parse, resolve, and route.
 * Called by ws-bridge when processing user messages.
 *
 * @returns Array of target session IDs that were mentioned, or empty if no mentions
 */
export function handleMentions(
  message: string,
  fromSessionId: string,
  fromShortId: string,
  sendToSession: (sessionId: string, content: string) => void,
): string[] {
  const ctx = parseMentions(message, fromSessionId, fromShortId);
  if (!ctx) return [];

  const targetIds: string[] = [];

  for (const mention of ctx.mentions) {
    routeMention(ctx, mention, sendToSession);
    targetIds.push(mention.sessionId);
  }

  return targetIds;
}
