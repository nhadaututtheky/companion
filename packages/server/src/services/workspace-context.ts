/**
 * Workspace Context — Gathers shared context for workspace CLI sessions.
 * Combines wiki KB, CodeGraph, project rules, and workspace metadata.
 */

import { createLogger } from "../logger.js";
import { getWorkspace } from "./workspace-store.js";
import { getWikiStartContext, getWikiCodeGraphContext } from "./context-budget.js";
import type { CLIPlatform } from "@companion/shared";

const log = createLogger("workspace-context");

export interface WorkspaceContextResult {
  content: string;
  tokens: number;
  sources: string[];
}

/**
 * Gather shared context for a workspace session.
 * Returns a formatted context block to prepend to the session's system prompt.
 */
export function getWorkspaceContext(
  workspaceId: string,
  platform: CLIPlatform,
): WorkspaceContextResult | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const parts: string[] = [];
  const sources: string[] = [];
  let totalTokens = 0;

  // 1. Workspace identity header
  const otherClis = ws.clis
    .filter((c) => c.platform !== platform)
    .map((c) => `${c.platform} (${c.status})`)
    .join(", ");

  parts.push(
    `# Workspace: ${ws.name}`,
    `You are **${platform}** in this workspace.${otherClis ? ` Other agents: ${otherClis}.` : ""}`,
    `Project: ${ws.projectSlug} (${ws.projectPath ?? "unknown path"})`,
    "",
  );
  sources.push("workspace-meta");
  totalTokens += 50;

  // 2. Wiki KB (L0 core rules)
  const wiki = getWikiStartContext(ws.projectPath ?? undefined);
  if (wiki) {
    parts.push("## Wiki Knowledge Base", wiki.content, "");
    sources.push("wiki-l0");
    totalTokens += wiki.tokens;
  }

  // 3. CodeGraph cross-reference
  const codeGraph = getWikiCodeGraphContext(ws.projectSlug, 2000, ws.projectPath ?? undefined);
  if (codeGraph) {
    parts.push("## Code Intelligence", codeGraph.content, "");
    sources.push("codegraph");
    totalTokens += codeGraph.tokens;
  }

  const hasExtraContext = sources.length > 1;
  if (!hasExtraContext) {
    log.debug("No shared context beyond metadata", { workspaceId, platform });
  }

  return {
    content: parts.join("\n"),
    tokens: totalTokens,
    sources,
  };
}
