/**
 * CodeGraph semantic describer — generates 1-sentence descriptions for code symbols using AI.
 */

import { callAI, isAIConfigured } from "../services/ai-client.js";
import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { codeNodes } from "../db/schema.js";
import { eq, and, isNull } from "drizzle-orm";

const log = createLogger("codegraph-describer");

interface DescriptionInput {
  nodeId: number;
  symbolName: string;
  symbolType: string;
  signature: string | null;
  bodyPreview: string | null;
  filePath: string;
}

/**
 * Generate semantic descriptions for undescribed exported nodes.
 * Uses AI (Haiku tier) in batches. Skips silently if AI not configured.
 * Returns count of descriptions generated.
 */
export async function describeNodes(projectSlug: string): Promise<number> {
  if (!isAIConfigured()) {
    log.debug("AI not configured, skipping semantic descriptions");
    return 0;
  }

  const db = getDb();

  // Load undescribed exported nodes
  const undescribed = db
    .select({
      id: codeNodes.id,
      symbolName: codeNodes.symbolName,
      symbolType: codeNodes.symbolType,
      signature: codeNodes.signature,
      bodyPreview: codeNodes.bodyPreview,
      filePath: codeNodes.filePath,
    })
    .from(codeNodes)
    .where(
      and(
        eq(codeNodes.projectSlug, projectSlug),
        eq(codeNodes.isExported, true),
        isNull(codeNodes.description),
      ),
    )
    .all();

  if (undescribed.length === 0) {
    log.debug("No nodes need descriptions", { projectSlug });
    return 0;
  }

  log.info("Describing nodes", { projectSlug, count: undescribed.length });

  const inputs: DescriptionInput[] = undescribed.map((n) => ({
    nodeId: n.id,
    symbolName: n.symbolName,
    symbolType: n.symbolType,
    signature: n.signature,
    bodyPreview: n.bodyPreview,
    filePath: n.filePath,
  }));

  // Process in batches of 8
  const BATCH_SIZE = 8;
  let described = 0;

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);

    try {
      const descriptions = await describeBatch(batch);

      for (const desc of descriptions) {
        db.update(codeNodes)
          .set({ description: desc.description })
          .where(eq(codeNodes.id, desc.nodeId))
          .run();
        described++;
      }
    } catch (err) {
      log.warn("Description batch failed, continuing", { error: String(err), batchStart: i });
    }
  }

  log.info("Descriptions generated", { projectSlug, described, total: inputs.length });
  return described;
}

/**
 * Describe specific nodes by ID (on-demand, for reveal trigger).
 * Non-blocking — queues nodes and flushes after a short delay.
 */
const pendingDescriptions = new Map<string, Set<number>>(); // projectSlug → nodeIds
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function queueNodeDescription(projectSlug: string, nodeIds: number[]): void {
  if (!isAIConfigured() || nodeIds.length === 0) return;

  const pending = pendingDescriptions.get(projectSlug) ?? new Set();
  for (const id of nodeIds) {
    pending.add(id);
  }
  pendingDescriptions.set(projectSlug, pending);

  // Flush after 5s to batch nearby reveals
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushPendingDescriptions();
    }, 5_000);
  }
}

async function flushPendingDescriptions(): Promise<void> {
  for (const [projectSlug, nodeIds] of pendingDescriptions) {
    if (nodeIds.size === 0) continue;

    const db = getDb();
    const ids = [...nodeIds].slice(0, 20); // max 20 per flush
    nodeIds.clear();

    // Only describe nodes that don't already have descriptions
    const undescribed = db
      .select({
        id: codeNodes.id,
        symbolName: codeNodes.symbolName,
        symbolType: codeNodes.symbolType,
        signature: codeNodes.signature,
        bodyPreview: codeNodes.bodyPreview,
        filePath: codeNodes.filePath,
      })
      .from(codeNodes)
      .where(
        and(
          eq(codeNodes.projectSlug, projectSlug),
          isNull(codeNodes.description),
        ),
      )
      .all()
      .filter((n) => ids.includes(n.id));

    if (undescribed.length === 0) continue;

    const inputs: DescriptionInput[] = undescribed.map((n) => ({
      nodeId: n.id,
      symbolName: n.symbolName,
      symbolType: n.symbolType,
      signature: n.signature,
      bodyPreview: n.bodyPreview,
      filePath: n.filePath,
    }));

    try {
      const descriptions = await describeBatch(inputs);
      for (const desc of descriptions) {
        db.update(codeNodes)
          .set({ description: desc.description })
          .where(eq(codeNodes.id, desc.nodeId))
          .run();
      }
      log.info("On-demand descriptions generated", { projectSlug, count: descriptions.length });
    } catch (err) {
      log.warn("On-demand description failed", { error: String(err) });
    }
  }

  // Only delete entries we actually processed (not ones added during async flush)
  for (const [slug, nodeIds] of pendingDescriptions) {
    if (nodeIds.size === 0) pendingDescriptions.delete(slug);
  }
}

/**
 * Describe a batch of nodes with a single AI call.
 * Uses feature-aware prompt: output format is "Feature Area — Description" (max 80 chars).
 */
async function describeBatch(
  inputs: DescriptionInput[],
): Promise<Array<{ nodeId: number; description: string }>> {
  const symbolList = inputs
    .map((input, idx) => {
      const parts = [`${idx + 1}. [${input.symbolType}] ${input.symbolName}`];
      if (input.signature) parts[0] += input.signature;
      parts.push(`   File: ${input.filePath}`);
      if (input.bodyPreview) {
        const preview = input.bodyPreview.slice(0, 200).replace(/\n/g, "\n   ");
        parts.push(`   Body: ${preview}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");

  const response = await callAI({
    systemPrompt: [
      'You are a code documentation assistant. For each symbol, write a description in the format:',
      '"Feature Area — what it does" (max 80 characters total).',
      '',
      'Examples:',
      '- "Session Lifecycle — spawns and monitors CLI processes"',
      '- "Debate Engine — orchestrates multi-agent conversation rounds"',
      '- "Auth Middleware — validates API keys and rate limits"',
      '',
      'The Feature Area should be 1-3 words identifying the domain/subsystem.',
      'Return ONLY a JSON array of objects with "index" (1-based) and "description" fields.',
      'No markdown, no explanation.',
    ].join('\n'),
    messages: [{ role: "user", content: `Describe these code symbols:\n\n${symbolList}` }],
    tier: "fast",
    maxTokens: 1024,
  });

  // Parse JSON response
  const text = response.text.trim();

  try {
    // Try to extract JSON from response (may have markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log.warn("No JSON array found in AI response");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; description: string }>;

    return parsed
      .filter((item) => item.index >= 1 && item.index <= inputs.length && item.description)
      .map((item) => ({
        nodeId: inputs[item.index - 1]!.nodeId,
        description: item.description.slice(0, 500),
      }));
  } catch (err) {
    log.warn("Failed to parse AI description response", { error: String(err) });

    // Fallback: try line-by-line regex extraction
    return fallbackParse(text, inputs);
  }
}

/**
 * Fallback parser for when AI doesn't return valid JSON.
 */
function fallbackParse(
  text: string,
  inputs: DescriptionInput[],
): Array<{ nodeId: number; description: string }> {
  const results: Array<{ nodeId: number; description: string }> = [];

  // Try patterns like "1. description" or "1: description"
  const lineRegex = /(\d+)[.:]\s*(.+)/g;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(text)) !== null) {
    const index = parseInt(match[1]!, 10);
    const description = match[2]!.trim();

    if (index >= 1 && index <= inputs.length && description.length > 10) {
      results.push({
        nodeId: inputs[index - 1]!.nodeId,
        description: description.slice(0, 500),
      });
    }
  }

  return results;
}
