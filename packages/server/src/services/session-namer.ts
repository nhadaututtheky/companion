/**
 * Auto-generate session names from the first user message using AI.
 * Falls back to first 5 words if AI is unavailable.
 */

import { callAI, isAIConfigured } from "./ai-client.js";
import { createLogger } from "../logger.js";

const log = createLogger("session-namer");

/**
 * Generate a short session name (3-5 words) from the first user message.
 * Uses fast/cheap AI model. Falls back to message excerpt on failure.
 */
export async function generateSessionName(firstMessage: string): Promise<string> {
  const fallback = extractFallbackName(firstMessage);

  if (!isAIConfigured()) {
    return fallback;
  }

  try {
    const response = await callAI({
      systemPrompt:
        "Generate a 3-5 word title for this coding session based on the user's first message. " +
        "Be specific and descriptive. Respond with ONLY the title, no quotes, no punctuation at the end.",
      messages: [{ role: "user", content: firstMessage }],
      tier: "fast",
      maxTokens: 30,
    });

    const name = response.text?.trim();
    if (name && name.length > 0 && name.length <= 60) {
      return name;
    }
    return fallback;
  } catch (err) {
    log.debug("AI session naming failed, using fallback", { error: String(err) });
    return fallback;
  }
}

/** Extract first ~5 words from message, truncated to 40 chars */
function extractFallbackName(message: string): string {
  const cleaned = message
    .replace(/```[\s\S]*?```/g, "") // remove code blocks
    .replace(/[#*_~`]/g, "") // remove markdown
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();

  const words = cleaned.split(" ").slice(0, 5).join(" ");
  return words.length > 40 ? words.slice(0, 37) + "..." : words;
}
