/**
 * Pulse commands: /mood — agent operational health monitoring
 */

import { escapeHTML } from "../formatter.js";
import {
  getAllReadings,
  getLatestReading,
  type PulseReading,
} from "../../services/pulse-estimator.js";
import { resolveShortId } from "../../services/short-id.js";
import type { TelegramBridge } from "../telegram-bridge.js";

export function registerMoodCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /mood — Show pulse for all or specific session ─────────────────

  bot.command("mood", async (ctx) => {
    const arg = ctx.match?.trim();

    if (arg) {
      // /mood <sessionId or shortId> — detail for one session
      const resolvedId = resolveShortId(arg) ?? arg;
      const session = bridge.wsBridge.getSession(resolvedId);
      if (!session) {
        await ctx.reply(`No active session found for "${escapeHTML(arg)}".`);
        return;
      }

      const reading = getLatestReading(session.id);
      if (!reading) {
        await ctx.reply(`No pulse data for session ${escapeHTML(arg)} yet. Wait for a few turns.`);
        return;
      }

      await ctx.reply(formatDetailedPulse(session.id, session.state.short_id, reading), {
        parse_mode: "HTML",
      });
      return;
    }

    // /mood — all active sessions
    const allReadings = getAllReadings();
    if (allReadings.size === 0) {
      await ctx.reply("No active sessions with pulse data. Start a session and wait a few turns.");
      return;
    }

    const lines = [`<b>📊 Agent Pulse — ${allReadings.size} session(s)</b>\n`];

    for (const [sessionId, reading] of allReadings) {
      const session = bridge.wsBridge.getSession(sessionId);
      const shortId = session?.state.short_id ?? sessionId.slice(0, 8);
      const name = session?.state.name ?? "unknown";
      const cost = session?.state.total_cost_usd ?? 0;

      lines.push(formatCompactPulse(name, shortId, reading, cost));
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });
}

// ─── Formatters ─────────────────────────────────────────────────────────

const STATE_EMOJI: Record<string, string> = {
  flow: "🟢",
  focused: "🔵",
  cautious: "🟣",
  struggling: "🟡",
  spiraling: "🔴",
  blocked: "⏸",
};

const TREND_ARROW: Record<string, string> = {
  improving: "▲",
  stable: "▬",
  degrading: "▼",
};

const SIGNAL_LABELS: Record<string, string> = {
  failureRate: "Failure Rate",
  editChurn: "Edit Churn",
  costAccel: "Cost Accel",
  contextPressure: "Context",
  thinkingDepth: "Thinking",
  toolDiversity: "Tool Diversity",
  completionTone: "Tone",
};

function formatCompactPulse(name: string, shortId: string, reading: PulseReading, costUsd: number): string {
  const emoji = STATE_EMOJI[reading.state] ?? "⚪";
  const arrow = TREND_ARROW[reading.trend] ?? "";
  const stateLabel = reading.state.charAt(0).toUpperCase() + reading.state.slice(1);
  const trendLabel = reading.trend.charAt(0).toUpperCase() + reading.trend.slice(1);

  let line = `${emoji} <b>${escapeHTML(name)}</b> (@${escapeHTML(shortId)}) — ${stateLabel} [${reading.score}] ${arrow}`;
  line += `\n   Turn ${reading.turn} · $${costUsd.toFixed(2)} · ${trendLabel}`;

  // Add top issue for elevated scores
  if (reading.score > 40) {
    const topLabel = SIGNAL_LABELS[reading.topSignal] ?? reading.topSignal;
    const sigs: Record<string, number> = { ...reading.signals };
    const topValue = Math.round((sigs[reading.topSignal] ?? 0) * 100);
    line += `\n   ⚠ ${topLabel}: ${topValue}%`;
  }

  return line + "\n";
}

function formatDetailedPulse(sessionId: string, shortId: string | undefined, reading: PulseReading): string {
  const emoji = STATE_EMOJI[reading.state] ?? "⚪";
  const arrow = TREND_ARROW[reading.trend] ?? "";
  const stateLabel = reading.state.charAt(0).toUpperCase() + reading.state.slice(1);
  const sid = shortId ?? sessionId.slice(0, 8);

  const lines = [
    `<b>📊 Pulse: @${escapeHTML(sid)}</b>`,
    `Score: <b>${reading.score}/100</b> — ${emoji} ${stateLabel} ${arrow}`,
    "",
    "<b>Signal Breakdown:</b>",
  ];

  // Signal bars (using Unicode block chars)
  const sortedSignals = Object.entries(reading.signals).sort((a, b) => b[1] - a[1]);
  for (const [key, value] of sortedSignals) {
    const label = (SIGNAL_LABELS[key] ?? key).padEnd(14);
    const percent = Math.round(value * 100);
    const filled = Math.round(value * 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    lines.push(`  <code>${label} ${bar} ${String(percent).padStart(3)}%</code>`);
  }

  lines.push("");

  // Suggested actions for elevated scores
  if (reading.score > 40) {
    lines.push("<b>💡 Actions:</b>");
    lines.push(`  Reply to send guidance to agent`);
    if (shortId) {
      lines.push(`  /stop ${shortId} — Stop session`);
      lines.push(`  /compact ${shortId} — Compact context`);
    }
  }

  return lines.join("\n");
}
