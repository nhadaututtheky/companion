/**
 * WsBridge multi-brain (multi-agent workspace) — extracted from ws-bridge.ts (Phase 3).
 * Handles /spawn, /status commands and child session lifecycle notifications.
 */

import { createLogger } from "../logger.js";
import { broadcastToAll } from "./ws-broadcast.js";
import {
  getActiveSession,
  getSessionRecord,
  getChildSessions,
  countActiveSessions,
  type ActiveSession,
} from "./session-store.js";
import { getMaxSessions } from "./license.js";
import type { BrowserIncomingMessage, CLIPlatform } from "@companion/shared";

const log = createLogger("ws-multi-brain");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MultiBrainBridge {
  startSession: (opts: {
    projectSlug?: string;
    cwd: string;
    model: string;
    permissionMode?: string;
    source?: string;
    parentId?: string;
    name?: string;
    prompt?: string;
    cliPlatform?: CLIPlatform;
    role?: "coordinator" | "specialist" | "researcher" | "reviewer";
  }) => Promise<string>;
  sendUserMessage: (sessionId: string, content: string, source?: string) => void;
  broadcastEvent: (sessionId: string, event: Record<string, unknown>) => void;
}

// ─── /spawn Command ─────────────────────────────────────────────────────────

/** Handle /spawn command — spawn a child agent in the workspace. */
export async function handleSpawnCommand(
  bridge: MultiBrainBridge,
  session: ActiveSession,
  match: RegExpMatchArray,
): Promise<void> {
  const name = match[1]!;
  const role = (match[2] as "specialist" | "researcher" | "reviewer") ?? "specialist";
  const model = match[3] ?? session.state.model;
  const prompt = match[4] ?? "";

  // Session limit check
  const activeCount = countActiveSessions();
  const maxSessions = getMaxSessions();
  if (activeCount >= maxSessions) {
    broadcastToAll(session, {
      type: "system_message",
      message: `Cannot spawn agent — session limit reached (${maxSessions} active).`,
    } as unknown as BrowserIncomingMessage);
    return;
  }

  try {
    const parentRecord = getSessionRecord(session.id);
    const childSessionId = await bridge.startSession({
      projectSlug: parentRecord?.projectSlug ?? undefined,
      cwd: session.state.cwd,
      model,
      permissionMode: session.state.permissionMode,
      source: "agent",
      parentId: session.id,
      name,
      prompt: prompt || undefined,
      cliPlatform: (session.state.cli_platform as CLIPlatform) ?? "claude",
      role,
    });

    const childRecord = getSessionRecord(childSessionId);
    const childShortId = childRecord?.shortId;

    // Broadcast child_spawned event to parent's subscribers (web UI / Telegram)
    bridge.broadcastEvent(session.id, {
      type: "child_spawned",
      childSessionId,
      childShortId,
      childName: name,
      childRole: role,
      childModel: model,
    });

    // Inject confirmation into the brain session so Claude knows the agent was created
    const confirmMsg = `[Agent "${name}" spawned — shortId: ${childShortId}, role: ${role}, model: ${model}]`;
    bridge.sendUserMessage(session.id, confirmMsg, "system");

    log.info("Brain spawned child via /spawn", {
      parentId: session.id,
      childSessionId,
      name,
      role,
    });
  } catch (err) {
    log.error("Failed to spawn agent via /spawn", { parentId: session.id, error: String(err) });
    broadcastToAll(session, {
      type: "system_message",
      message: `Failed to spawn agent "${name}": ${String(err)}`,
    } as unknown as BrowserIncomingMessage);
  }
}

// ─── /status Command ────────────────────────────────────────────────────────

/** Handle /status command — show agent statuses in workspace. */
export function handleStatusCommand(bridge: MultiBrainBridge, session: ActiveSession): void {
  try {
    const children = getChildSessions(session.id);

    if (children.length === 0) {
      bridge.sendUserMessage(session.id, "[No agents spawned in this workspace.]", "system");
      return;
    }

    const lines = children.map((child) => {
      const liveSession = getActiveSession(child.id);
      const liveStatus = liveSession?.state.status ?? child.status ?? "ended";
      const cost = child.totalCostUsd ? `$${Number(child.totalCostUsd).toFixed(4)}` : "$0.00";
      const roleLabel = child.role ?? "agent";
      const nameLabel = child.name ?? child.shortId ?? child.id.slice(0, 8);
      const statusIcon =
        liveStatus === "idle"
          ? "💤"
          : liveStatus === "busy"
            ? "🔄"
            : liveStatus === "ended"
              ? "✅"
              : liveStatus === "error"
                ? "❌"
                : "⏳";
      return `  ${statusIcon} **${nameLabel}** (${roleLabel}) @${child.shortId} — ${liveStatus} — ${cost}`;
    });

    const totalCost = children.reduce((sum, c) => sum + Number(c.totalCostUsd ?? 0), 0);
    const statusReport = [
      `[Workspace Status — ${children.length} agent(s)]`,
      ...lines,
      `  Total agent cost: $${totalCost.toFixed(4)}`,
    ].join("\n");

    bridge.sendUserMessage(session.id, statusReport, "system");
  } catch (err) {
    log.error("Failed to get workspace status", { sessionId: session.id, error: String(err) });
    bridge.sendUserMessage(session.id, "[Failed to retrieve workspace status.]", "system");
  }
}

// ─── Child Ended Notification ───────────────────────────────────────────────

/** Notify parent session when a child session ends (multi-brain workspace). */
export function notifyParentOfChildEnd(
  bridge: MultiBrainBridge,
  childSessionId: string,
  status: string,
  preEndShortId?: string,
): void {
  try {
    const childRecord = getSessionRecord(childSessionId);
    if (!childRecord?.parentId) return;

    const parentSession = getActiveSession(childRecord.parentId);
    if (!parentSession) return;

    // Use pre-saved shortId since endSessionRecord clears it before this runs
    const childShortId = preEndShortId ?? childRecord.shortId;

    // Broadcast child_ended event to parent's subscribers (web UI)
    bridge.broadcastEvent(childRecord.parentId, {
      type: "child_ended",
      childSessionId,
      childShortId,
      childName: childRecord.name,
      childRole: childRecord.role,
      status,
    });

    // Notify parent via @mention so Claude in parent session knows
    const childLabel = childRecord.name ?? childShortId ?? childSessionId.slice(0, 8);
    const statusEmoji = status === "ended" ? "✅" : "❌";
    const notification = `[Agent "${childLabel}" has ${status === "ended" ? "completed" : "errored"} ${statusEmoji}]`;
    bridge.sendUserMessage(childRecord.parentId, notification, "system");
  } catch (err) {
    log.error("Failed to notify parent of child end", { childSessionId, error: String(err) });
  }
}
