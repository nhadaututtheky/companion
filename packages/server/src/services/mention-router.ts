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

    if (!sessionId) {
      log.debug("Unresolved mention", { shortId });
      continue;
    }

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
 * Route a mention to the target session.
 * Sends a contextualized message to the target session's CLI.
 * The injected prompt deliberately avoids @shortId syntax to prevent recursive routing.
 */
function routeMention(
  ctx: MentionContext,
  mention: ParsedMention,
  sendToSession: (sessionId: string, content: string) => void,
): void {
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
