/**
 * Convergence Detector — Determines if debate agents are reaching agreement
 * or going in circles.
 */

import { getChannelMessages } from "./channel-manager.js";
import { callAI, isAIConfigured } from "./ai-client.js";
import { createLogger } from "../logger.js";

const log = createLogger("convergence");

export interface ConvergenceResult {
  converged: boolean;
  score: number; // 0-100
  staleRounds: number;
  reason: string;
}

/**
 * Check if a debate has converged.
 * Uses fast AI model to extract key points and compare overlap.
 */
export async function checkConvergence(
  channelId: string,
  currentRound: number,
): Promise<ConvergenceResult> {
  if (!isAIConfigured()) {
    return { converged: false, score: 0, staleRounds: 0, reason: "No AI provider" };
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

    const aiResponse = await callAI({
      systemPrompt: "You analyze debates for convergence. Respond with JSON only.",
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
      tier: "fast",
      maxTokens: 300,
    });

    try {
      const parsed = JSON.parse(aiResponse.text) as {
        convergenceScore: number;
        newPointsInLatestRound: boolean;
        reason: string;
      };

      const staleRounds = parsed.newPointsInLatestRound ? 0 : 1;
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
