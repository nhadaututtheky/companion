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
import { createLogger } from "../logger.js";

const log = createLogger("mention-router");

/** Pattern string for @shortId mentions — create new RegExp per use to avoid stale lastIndex */
const MENTION_PATTERN = "@([a-z][a-z0-9-]*)";

function createMentionRegex(): RegExp {
  return new RegExp(MENTION_PATTERN, "gi");
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
    const sessionId = resolveShortId(shortId);

    if (sessionId) {
      // Don't mention yourself
      if (sessionId === fromSessionId) continue;

      // Check session is active
      const target = getActiveSession(sessionId);
      if (!target) {
        log.debug("Mentioned session not active", { shortId, sessionId });
        continue;
      }

      mentions.push({
        shortId,
        sessionId,
        start: match.index,
        end: match.index + match[0].length,
      });
    } else {
      // Try resolving as a debate agent ID (e.g. @advocate, @challenger)
      const debateMatch = resolveDebateAgentMention(shortId);
      if (debateMatch) {
        mentions.push({
          shortId,
          sessionId: `debate:${debateMatch.channelId}`,
          debateChannelId: debateMatch.channelId,
          start: match.index,
          end: match.index + match[0].length,
        });
      } else {
        log.debug("Unresolved mention", { shortId });
      }
    }
  }

  if (mentions.length === 0) return null;

  // Remove duplicate mentions (same session mentioned multiple times)
  const unique = mentions.filter(
    (m, i, arr) => arr.findIndex((x) => x.sessionId === m.sessionId) === i,
  );

  // Build clean message — only strip resolved @mentions (by position, reverse order to preserve indices)
  let cleanMessage = message;
  const sortedByPos = [...unique].sort((a, b) => b.start - a.start);
  for (const m of sortedByPos) {
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
function resolveDebateAgentMention(
  shortId: string,
): { channelId: string; agentId: string } | null {
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

  // Build the message — NO @shortId in text to prevent recursive mention routing
  const prompt = [
    `[Cross-session mention from session "${ctx.fromShortId}"]`,
    ``,
    ctx.cleanMessage,
    ``,
    `---`,
    `Reply naturally. Your response will be shared back with session "${ctx.fromShortId}".`,
    `You are session "${mention.shortId}". Keep your response concise and focused.`,
  ].join("\n");

  log.info("Routing mention", {
    from: ctx.fromShortId,
    to: mention.shortId,
    targetSessionId: mention.sessionId,
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
