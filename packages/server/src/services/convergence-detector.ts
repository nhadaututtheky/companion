/**
 * Convergence Detector — Determines if debate agents are reaching agreement
 * or going in circles.
 */

import { getChannelMessages } from "./channel-manager.js";
import { createLogger } from "../logger.js";

const log = createLogger("convergence");

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export interface ConvergenceResult {
  converged: boolean;
  score: number; // 0-100
  staleRounds: number;
  reason: string;
}

/**
 * Check if a debate has converged.
 * Uses Haiku to extract key points and compare overlap.
 */
export async function checkConvergence(
  channelId: string,
  currentRound: number,
): Promise<ConvergenceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { converged: false, score: 0, staleRounds: 0, reason: "No API key" };
  }

  try {
    // Get messages from last 2 rounds
    const allMessages = getChannelMessages(channelId, 100);
    const recentMessages = allMessages.filter(
      (m) => m.round >= currentRound - 1 && m.role !== "human" && m.role !== "judge",
    );

    if (recentMessages.length < 2) {
      return { converged: false, score: 0, staleRounds: 0, reason: "Not enough messages" };
    }

    // Build transcript of recent rounds
    const transcript = recentMessages
      .map((m) => `[${m.role.toUpperCase()} R${m.round}]: ${m.content}`)
      .join("\n\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Analyze this debate excerpt. Are the participants converging (agreeing) or going in circles (repeating same points)?

${transcript}

Respond with JSON only:
{
  "convergenceScore": 0-100 (100 = complete agreement),
  "newPointsInLatestRound": true/false,
  "reason": "brief explanation"
}`,
        }],
      }),
    });

    if (!res.ok) {
      log.error("Convergence check API error", { status: res.status });
      return { converged: false, score: 0, staleRounds: 0, reason: "API error" };
    }

    const data = await res.json() as { content: Array<{ text: string }> };
    const text = data.content?.[0]?.text ?? "";

    try {
      const parsed = JSON.parse(text) as {
        convergenceScore: number;
        newPointsInLatestRound: boolean;
        reason: string;
      };

      // Track stale rounds (no new points)
      const staleRounds = parsed.newPointsInLatestRound ? 0 : 1;

      // Check previous stale detection (rough: if score > 60 and no new points, likely stale)
      const converged = parsed.convergenceScore >= 70 || staleRounds >= 2;

      return {
        converged,
        score: parsed.convergenceScore,
        staleRounds,
        reason: parsed.reason,
      };
    } catch {
      return { converged: false, score: 0, staleRounds: 0, reason: "Failed to parse" };
    }
  } catch (err) {
    log.error("Convergence check failed", { channelId, error: String(err) });
    return { converged: false, score: 0, staleRounds: 0, reason: String(err) };
  }
}
