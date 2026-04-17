/**
 * Telegram session message router — dispatches CLI events to their handlers.
 * Extracted from TelegramBridge to reduce god-file complexity.
 *
 * All handler functions in telegram-session-events.ts and telegram-permission-handler.ts
 * are invoked from here after the appropriate event type is matched.
 */

import { escapeHTML } from "./formatter.js";
import { getLatestReading, type OperationalState } from "../services/pulse-estimator.js";
import { createLogger } from "../logger.js";
import {
  handleAssistantMessage,
  handleStreamEvent,
  handleResultMessage,
  handleContextUpdate,
  sendSessionSummary,
  handleChildSpawned,
  handleChildEnded,
} from "./telegram-session-events.js";
import { handlePermissionRequest } from "./telegram-permission-handler.js";
import type { TelegramBridge } from "./telegram-bridge.js";
import type { BrowserIncomingMessage } from "@companion/shared";

const log = createLogger("telegram-session-router");

/**
 * Routes an incoming CLI event message to the appropriate handler.
 * This is the extracted body of TelegramBridge.handleSessionMessage.
 */
export async function routeSessionMessage(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  sessionId: string,
  msg: BrowserIncomingMessage,
): Promise<void> {
  try {
    // Reset busy watchdog + idle timer on any sign of CLI activity
    if (
      msg.type === "assistant" ||
      msg.type === "tool_progress" ||
      msg.type === "stream_event" ||
      msg.type === "stream_event_batch"
    ) {
      bridge.resetBusyWatchdog(sessionId, chatId, topicId);

      // Debounce idle timer reset — stream events fire rapidly, only reset every 30s
      const cfg = bridge.getSessionConfig(sessionId);
      const now = Date.now();
      if (!cfg.lastIdleReset || now - cfg.lastIdleReset > 30_000) {
        cfg.lastIdleReset = now;
        bridge.resetIdleTimer(sessionId, chatId, topicId ?? undefined);
      }
    }

    switch (msg.type) {
      case "assistant":
        await handleAssistantMessage(bridge, chatId, topicId, msg);
        break;

      case "stream_event":
        await handleStreamEvent(bridge, chatId, topicId, msg);
        break;

      case "stream_event_batch": {
        // Unpack batched stream events and process each one
        const batch = msg as unknown as {
          events: Array<{ event: unknown; parent_tool_use_id?: string }>;
        };
        for (const entry of batch.events) {
          await handleStreamEvent(bridge, chatId, topicId, {
            type: "stream_event",
            event: entry.event,
            parent_tool_use_id: entry.parent_tool_use_id ?? null,
          } as BrowserIncomingMessage & { type: "stream_event" });
        }
        break;
      }

      case "result":
        await handleResultMessage(bridge, chatId, topicId, sessionId, msg.data);
        break;

      case "permission_request":
        await handlePermissionRequest(bridge, chatId, topicId, sessionId, msg.request);
        break;

      case "session_init": {
        // Store the cliSessionId in telegram_session_mappings when CLI initializes
        const cliSessionId = (msg.session as { session_id?: string })?.session_id;
        if (cliSessionId) {
          bridge.updateMappingCliSessionId(sessionId, cliSessionId);
        }
        break;
      }

      case "context_breakdown": {
        // Only store breakdown silently — don't send a message.
        // Users access it via the 📊 button shown in session_init or /context command.
        if ("breakdown" in msg) {
          const { formatBreakdownDetailed } = await import("../services/context-estimator.js");
          const bd = msg.breakdown as import("../services/context-estimator.js").ContextBreakdown;
          bridge.setContextBreakdown(sessionId, formatBreakdownDetailed(bd));
        }
        break;
      }

      case "context_update":
        await handleContextUpdate(bridge, chatId, topicId, sessionId, msg.contextUsedPercent);
        break;

      case "cost_warning": {
        const icon = msg.level === "critical" ? "🔴" : "⚠️";
        await bridge.bot.api
          .sendMessage(
            chatId,
            `${icon} <b>Cost Budget ${msg.level === "critical" ? "Reached" : "Warning"}</b>\n${escapeHTML(msg.message)}\n\nUse <code>/stop</code> to end session or continue working.`,
            { parse_mode: "HTML", message_thread_id: topicId },
          )
          .catch(() => {});
        break;
      }

      case "cli_disconnected": {
        // CLI process died — flush any pending stream text so it's not lost
        await bridge.streamHandler.completeStream(chatId, topicId);
        bridge.cleanupToolFeed(chatId, topicId);

        // Build user-friendly disconnect message
        const exitCode = (msg as unknown as { exitCode?: number }).exitCode;
        const reason = (msg as unknown as { reason?: string }).reason;

        let icon = "⚠️";
        let title = "Session ended";
        let detail = "";

        if (exitCode === 143 || exitCode === 137) {
          // SIGTERM / SIGKILL — normal stop
          icon = "🔴";
          title = "Session stopped";
          detail = "The session was terminated normally.";
        } else if (exitCode === 0 || exitCode === null || exitCode === undefined) {
          icon = "✅";
          title = "Session completed";
          detail = "Task finished successfully.";
        } else if (reason?.includes("crashed on startup")) {
          icon = "❌";
          title = "Session failed to start";
          detail = "Check that Claude Code CLI is installed and authenticated.";
        } else {
          icon = "⚠️";
          title = "Session disconnected";
          detail = reason
            ? escapeHTML(reason.slice(0, 300))
            : `Unexpected exit (code ${exitCode ?? "unknown"})`;
        }

        const hint = "\n\nUse /start to begin a new session.";
        await bridge.bot.api
          .sendMessage(chatId, `${icon} <b>${title}</b>\n${detail}${hint}`, {
            parse_mode: "HTML",
            message_thread_id: topicId,
          })
          .catch(() => {});

        // Clean up stale mapping so /resume doesn't see "already active"
        bridge.removeMapping(chatId, topicId);
        // Clean up session config timers
        bridge.cleanupSessionConfig(sessionId);
        break;
      }

      case "status_change":
        if (msg.status === "ended") {
          // Flush any pending stream text before cleanup
          await bridge.streamHandler.completeStream(chatId, topicId);
          bridge.cleanupToolFeed(chatId, topicId);
          bridge.removeMapping(chatId, topicId);
          bridge.clearPulseState(sessionId);
          // Send summary after a delay (wait for summarizer to finish)
          void sendSessionSummary(bridge, chatId, topicId, sessionId);
        }
        break;

      case "tool_progress":
        // Refresh typing indicator while tools run
        bridge.bot.api
          .sendChatAction(chatId, "typing", {
            message_thread_id: topicId,
          })
          .catch(() => {});
        break;

      case "user_message": {
        // Show messages sent from Web/API in the Telegram chat
        const userSource = (msg as unknown as { source?: string }).source;
        if (userSource && userSource !== "telegram") {
          const userText = (msg as unknown as { content?: string }).content ?? "";
          if (userText.trim()) {
            const label = userSource === "web" ? "🌐 Web" : "📡 API";
            await bridge.bot.api
              .sendMessage(chatId, `<i>${label}:</i>\n${escapeHTML(userText.slice(0, 2000))}`, {
                parse_mode: "HTML",
                message_thread_id: topicId,
              })
              .catch(() => {});
          }
        }
        break;
      }

      case "child_spawned":
        await handleChildSpawned(bridge, chatId, topicId, sessionId, msg);
        break;

      case "child_ended":
        await handleChildEnded(bridge, chatId, topicId, msg);
        break;

      case "pulse:update": {
        const ALERT_STATES = new Set<OperationalState>(["struggling", "spiraling", "blocked"]);
        const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alerts per session

        const prevState = bridge.getPulsePrevState(sessionId);
        const newState = msg.state as OperationalState;
        bridge.setPulsePrevState(sessionId, newState);

        // Alert on: (1) transition INTO an alert state, or (2) escalation within alert states
        // Skip if: not an alert state, or same state as before (no change)
        if (!ALERT_STATES.has(newState) || newState === prevState) {
          break;
        }

        // Cooldown check
        const lastAlert = bridge.getPulseAlertCooldown(sessionId) ?? 0;
        if (Date.now() - lastAlert < COOLDOWN_MS) break;

        bridge.setPulseAlertCooldown(sessionId, Date.now());

        const session = bridge.wsBridge.getSession(sessionId);
        const shortId = session?.state.short_id ?? sessionId.slice(0, 8);
        const projectName = session?.state.name ?? "Unknown";

        const stateEmoji: Record<string, string> = {
          struggling: "🟡",
          spiraling: "🔴",
          blocked: "⏸",
        };
        const emoji = stateEmoji[newState] ?? "⚠️";
        const stateLabel = newState.charAt(0).toUpperCase() + newState.slice(1);

        const SIGNAL_LABELS: Record<string, string> = {
          failureRate: "Failure Rate",
          editChurn: "Edit Churn",
          costAccel: "Cost Accel",
          contextPressure: "Context Pressure",
          thinkingDepth: "Thinking Depth",
          toolDiversity: "Tool Diversity",
          completionTone: "Tone",
        };

        const reading = getLatestReading(sessionId);
        const topSignalKey = reading?.topSignal ?? "unknown";
        const topSignalLabel = SIGNAL_LABELS[topSignalKey] ?? topSignalKey;
        const sigs: Record<string, number> = reading ? { ...reading.signals } : {};
        const topSignalValue = reading ? Math.round((sigs[topSignalKey] ?? 0) * 100) : 0;

        const alertText = [
          `${emoji} <b>Pulse Alert: ${escapeHTML(projectName)}</b> (@${escapeHTML(shortId)})`,
          `State: <b>${stateLabel}</b> — Score ${msg.score}/100`,
          `Top signal: ${topSignalLabel} (${topSignalValue}%)`,
          `Turn ${msg.turn}`,
          "",
          `💡 Reply to send guidance, or:`,
          `  <code>/mood ${shortId}</code> — Full breakdown`,
          `  <code>/stop ${shortId}</code> — Stop session`,
        ].join("\n");

        await bridge.bot.api
          .sendMessage(chatId, alertText, {
            parse_mode: "HTML",
            message_thread_id: topicId,
          })
          .catch(() => {});
        break;
      }

      case "error":
        await bridge.bot.api.sendMessage(chatId, `⚠️ ${escapeHTML(msg.message)}`, {
          parse_mode: "HTML",
          message_thread_id: topicId,
        });
        break;
    }
  } catch (err) {
    log.error("Error handling session message", { chatId, error: String(err) });
  }
}
