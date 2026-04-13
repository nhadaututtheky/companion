"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket } from "./use-websocket";
import { useSessionStore } from "@/lib/stores/session-store";
import { useActivityStore } from "@/lib/stores/activity-store";
import { useContextFeedStore } from "@/lib/stores/context-feed-store";
import { useGraphActivityStore } from "@/lib/stores/graph-activity-store";
import { usePulseStore } from "@/lib/stores/pulse-store";
import { notify } from "./use-notifications";
import { api } from "@/lib/api-client";
import type {
  BrowserIncomingMessage,
  ContentBlock,
  SessionState,
  ThinkingMode,
} from "@companion/shared";

/**
 * Session-aware notification: respects per-session notifyMode.
 * "error" type always fires toast regardless of mode (safety override).
 */
function sessionNotify(
  sessionId: string,
  type: "success" | "error" | "info",
  message: string,
  opts?: { duration?: number },
) {
  const session = useSessionStore.getState().sessions[sessionId];
  const mode = session?.notifyMode ?? "visual";

  // Errors always show toast (safety override)
  if (type === "error" || mode === "toast") {
    import("sonner").then(({ toast }) => {
      toast[type](message, opts);
    });
    return;
  }

  if (mode === "visual") {
    useSessionStore.getState().triggerFlash(sessionId, type);
    return;
  }

  // mode === "off" — do nothing
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  thinkingBlocks?: Array<{ text: string }>;
  toolUseBlocks?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  toolResultBlocks?: Array<{ toolUseId: string; content: string; isError?: boolean }>;
  costUsd?: number;
  source?: string;
}

interface PermissionRequest {
  requestId: string;
  toolName: string;
  description?: string;
}

interface LockStatus {
  locked: boolean;
  owner: string | null;
  queueSize: number;
}

export interface ScanResultState {
  risks: Array<{ category: string; severity: string; description: string; matched: string }>;
  blocked: boolean;
}

interface UseSessionReturn {
  messages: Message[];
  pendingPermissions: PermissionRequest[];
  wsStatus: "connecting" | "connected" | "disconnected";
  lockStatus: LockStatus;
  lastScanResult: ScanResultState | null;
  spectatorCount: number;
  sendMessage: (text: string, images?: Array<{ data: string; mediaType: string; name: string }>) => void;
  respondPermission: (requestId: string, behavior: "allow" | "deny") => void;
  setModel: (model: string) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
}

const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 0.8 / 1_000_000, output: 4.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-opus-4-6": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
};

function makeSystemMessage(content: string): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-sys`,
    role: "system",
    content,
    timestamp: Date.now(),
  };
}

export function useSession(sessionId: string): UseSessionReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">(
    "disconnected",
  );
  const [lockStatus, setLockStatus] = useState<LockStatus>({
    locked: false,
    owner: null,
    queueSize: 0,
  });
  const [lastScanResult, setLastScanResult] = useState<ScanResultState | null>(null);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const setSession = useSessionStore((s) => s.setSession);
  const addLog = useActivityStore((s) => s.addLog);
  // Track whether WS message_history replay populated messages
  const historyReceivedRef = useRef(false);
  // Ref for REST fallback timer so it can be cleared across effect re-runs
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Stream buffering: accumulate tokens, flush every 50ms ──
  const streamBufferRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the current streaming message ID so "assistant" final can find & replace it
  const activeStreamIdRef = useRef<string | null>(null);

  const flushStreamBuffer = useCallback(() => {
    flushTimerRef.current = null;
    const buffered = streamBufferRef.current;
    if (!buffered) return;
    streamBufferRef.current = "";

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.isStreaming && last.role === "assistant") {
        // Update only the last element — avoid copying entire array
        const updated = { ...last, content: last.content + buffered };
        const next = prev.slice();
        next[next.length - 1] = updated;
        return next;
      }
      const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-stream`;
      activeStreamIdRef.current = newId;
      return [
        ...prev,
        {
          id: newId,
          role: "assistant" as const,
          content: buffered,
          timestamp: Date.now(),
          isStreaming: true,
        },
      ];
    });
  }, []);

  // Cleanup flush timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  // REST fallback: when WS connects but message_history replay is empty, load from DB
  useEffect(() => {
    if (wsStatus !== "connected") return;

    // Clear any existing timer in case wsStatus flipped quickly
    clearTimeout(fallbackTimerRef.current);

    // Give message_history event a short window to arrive (it comes right after connect)
    fallbackTimerRef.current = setTimeout(async () => {
      if (historyReceivedRef.current) return;
      // No history received via WS — fall back to REST
      try {
        const res = await api.sessions.messages(sessionId, { limit: 50 });
        const dbMessages = res.data?.messages ?? [];
        if (dbMessages.length === 0) return;
        const loaded: Message[] = dbMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.timestamp,
            source: m.source,
          }))
          .filter((m) => m.content.length > 0);
        if (loaded.length > 0) {
          setMessages((prev) => (prev.length === 0 ? loaded : prev));
        }
      } catch {
        // Best-effort — silently ignore if REST fails
      }
    }, 800);

    return () => clearTimeout(fallbackTimerRef.current);
  }, [wsStatus, sessionId]);

  // Helper: resolve session display name
  const getSessionName = useCallback(() => {
    const session = useSessionStore.getState().sessions[sessionId];
    return session?.projectName ?? sessionId.slice(0, 8);
  }, [sessionId]);

  const handleMessage = useCallback(
    (raw: unknown) => {
      const msg = raw as BrowserIncomingMessage;

      // Shared stream event processor (used by both stream_event and stream_event_batch)
      const processStreamEvent = (event: unknown) => {
        const ev = event as {
          type?: string;
          delta?: { text?: string; type?: string; thinking?: string };
          content_block?: { type?: string };
        };
        const text = ev?.delta?.text ?? "";

        if (
          ev?.type === "content_block_start" &&
          (ev as { content_block?: { type?: string } }).content_block?.type === "thinking"
        ) {
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "thinking",
            content: "Thinking...",
          });
        } else if (ev?.delta?.type === "thinking_delta" && ev.delta.thinking) {
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "thinking",
            content: ev.delta.thinking.slice(0, 120),
          });
        }

        if (text) {
          streamBufferRef.current += text;
          if (!flushTimerRef.current) {
            flushTimerRef.current = setTimeout(flushStreamBuffer, 50);
          }
        }
      };

      switch (msg.type) {
        case "assistant": {
          // Flush any buffered stream text before processing final message
          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
          streamBufferRef.current = "";

          const content = msg.message?.content ?? [];
          const text = content
            .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
            .map((b) => b.text)
            .join("");

          // Extract thinking, tool_use, tool_result blocks for inline rendering
          const thinkingBlocks = content
            .filter((b): b is Extract<ContentBlock, { type: "thinking" }> => b.type === "thinking")
            .map((b) => ({ text: b.thinking }));

          const toolUseBlocks = content
            .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use")
            .map((b) => ({ id: b.id, name: b.name, input: b.input ?? {} }));

          const toolResultBlocks = content
            .filter(
              (b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result",
            )
            .map((b) => ({
              toolUseId: b.tool_use_id,
              content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
              isError: b.is_error,
            }));

          // Log tool_use blocks to activity terminal
          for (const block of toolUseBlocks) {
            const inputSummary = Object.entries(block.input)
              .slice(0, 2)
              .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 60)}`)
              .join(", ");
            addLog({
              sessionId,
              sessionName: getSessionName(),
              timestamp: Date.now(),
              type: "tool_use",
              content: `${block.name}(${inputSummary})`,
              meta: { toolName: block.name, input: block.input },
            });
          }

          // Get cost from usage using model-specific rates
          const sessionModel = useSessionStore.getState().sessions[sessionId]?.model ?? "";
          const rates = MODEL_RATES[sessionModel] ?? MODEL_RATES["claude-sonnet-4-6"]!;
          const usage = msg.message?.usage;
          const costUsd = usage
            ? usage.input_tokens * rates.input + usage.output_tokens * rates.output
            : undefined;

          const messageData = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-ast`,
            role: "assistant" as const,
            content: text,
            timestamp: Date.now(),
            isStreaming: false,
            thinkingBlocks: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
            toolUseBlocks: toolUseBlocks.length > 0 ? toolUseBlocks : undefined,
            toolResultBlocks: toolResultBlocks.length > 0 ? toolResultBlocks : undefined,
            costUsd,
          };

          if (text || toolUseBlocks.length > 0 || thinkingBlocks.length > 0) {
            const streamId = activeStreamIdRef.current;
            activeStreamIdRef.current = null;

            setMessages((prev) => {
              // Find the streaming message to replace (by tracked ID or last streaming)
              const streamIdx = streamId
                ? prev.findIndex((m) => m.id === streamId)
                : prev.findLastIndex((m) => m.role === "assistant" && m.isStreaming);

              if (streamIdx >= 0) {
                const updated = [...prev];
                updated[streamIdx] = { ...prev[streamIdx]!, ...messageData };
                return updated;
              }
              // Dedup: skip if last assistant message has same content (server duplicate)
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.content === text) {
                return prev;
              }
              return [...prev, messageData];
            });
          }
          break;
        }

        case "stream_event": {
          processStreamEvent(msg.event);
          break;
        }

        case "stream_event_batch": {
          const batch = msg as { events?: Array<{ event: unknown }> };
          if (batch.events) {
            for (const entry of batch.events) {
              processStreamEvent(entry.event);
            }
          }
          break;
        }

        case "result": {
          // Flush any remaining buffered stream text
          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
          if (streamBufferRef.current) {
            flushStreamBuffer();
          }

          const result = msg.data;
          if (result) {
            const costStr = `$${result.total_cost_usd.toFixed(4)}`;
            const tokensStr = `${(result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0)} tokens`;
            const summary = result.is_error
              ? `Error — ${result.errors?.join("; ") ?? "unknown"}`
              : `Done — ${costStr}, ${tokensStr}, ${result.num_turns} turn(s)`;
            // Browser notification for session result
            if (result.is_error) {
              notify(
                `Session error: ${getSessionName()}`,
                result.errors?.join("; ") ?? "Unknown error",
              );
            } else {
              notify(
                `Session complete: ${getSessionName()}`,
                `${costStr} · ${tokensStr} · ${result.num_turns} turn(s)`,
              );
            }
            addLog({
              sessionId,
              sessionName: getSessionName(),
              timestamp: Date.now(),
              type: result.is_error ? "error" : "result",
              content: summary,
              meta: {
                totalCostUsd: result.total_cost_usd,
                numTurns: result.num_turns,
                durationMs: result.duration_ms,
              },
            });
            // Also log cost separately
            if (!result.is_error) {
              addLog({
                sessionId,
                sessionName: getSessionName(),
                timestamp: Date.now(),
                type: "cost",
                content: `Cost: ${costStr} | Input: ${result.usage?.input_tokens ?? 0} | Output: ${result.usage?.output_tokens ?? 0} | Cache read: ${result.usage?.cache_read_input_tokens ?? 0}`,
                meta: { usage: result.usage, totalCostUsd: result.total_cost_usd },
              });
            }
          }
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const updated = last?.isStreaming
              ? [...prev.slice(0, -1), { ...last, isStreaming: false }]
              : [...prev];

            // Inject end-of-session message — skip if already present (dedup)
            if (result) {
              const hasEndMsg = updated.some(
                (m) =>
                  m.role === "system" &&
                  (m.content.includes("Session completed") ||
                    m.content.includes("Session ended with an error")),
              );
              if (!hasEndMsg) {
                if (result.is_error) {
                  updated.push(
                    makeSystemMessage(
                      `⚠ Session ended with an error. You can send a new message to resume, or close this session.`,
                    ),
                  );
                } else {
                  const costStr = `$${result.total_cost_usd.toFixed(4)}`;
                  const turns = result.num_turns;
                  updated.push(
                    makeSystemMessage(
                      `Session completed — ${turns} turn${turns !== 1 ? "s" : ""}, ${costStr}. Send a message to continue or close when done.`,
                    ),
                  );
                }
              }
            }
            return updated;
          });
          break;
        }

        case "user_message": {
          // User message from another source (e.g. Telegram) — show in feed
          const umMsg = msg as {
            type: "user_message";
            content: string;
            timestamp: number;
            source?: string;
          };
          // Skip if this is a message we sent locally from the web UI
          if (umMsg.source && umMsg.source !== "web") {
            const msgId = `${umMsg.timestamp}-user-${umMsg.source}`;
            setMessages((prev) => {
              // Dedup: skip if a message with same timestamp+content already exists (e.g. reconnect replay)
              const isDuplicate = prev.some(
                (m) =>
                  m.role === "user" &&
                  m.timestamp === umMsg.timestamp &&
                  m.content === umMsg.content,
              );
              if (isDuplicate) return prev;
              return [
                ...prev,
                {
                  id: msgId,
                  role: "user" as const,
                  content: umMsg.content,
                  timestamp: umMsg.timestamp,
                  source: umMsg.source,
                },
              ];
            });
          }
          break;
        }

        case "permission_request": {
          const req = msg.request as {
            request_id: string;
            tool_name: string;
            description?: string;
          };
          // Browser notification so user knows action is needed
          notify(
            `Permission needed: ${getSessionName()}`,
            `${req.tool_name}${req.description ? ` — ${req.description}` : ""}`,
          );
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "permission",
            content: `Permission requested: ${req.tool_name}${req.description ? ` — ${req.description}` : ""}`,
            meta: { toolName: req.tool_name, requestId: req.request_id },
          });
          setPendingPermissions((prev) => [
            ...prev,
            {
              requestId: req.request_id,
              toolName: req.tool_name,
              description: req.description,
            },
          ]);
          break;
        }

        case "status_change": {
          if (msg.status) {
            setSession(sessionId, { status: msg.status });
          }
          break;
        }

        case "session_update": {
          if (msg.session) {
            const current = useSessionStore.getState().sessions[sessionId];
            setSession(sessionId, {
              state: {
                ...(current?.state ?? {}),
                ...msg.session,
              } as SessionState,
            });
          }
          break;
        }

        case "session_init": {
          if (msg.session) {
            setSession(sessionId, {
              status: msg.session.status,
              model: msg.session.model,
              state: msg.session,
            });
          }
          break;
        }

        case "message_history": {
          historyReceivedRef.current = true;
          if (msg.messages && Array.isArray(msg.messages)) {
            const historical: Message[] = msg.messages
              .filter(
                (m): m is Extract<typeof m, { type: "assistant" | "user_message" }> =>
                  m.type === "assistant" || m.type === "user_message",
              )
              .map((m) => {
                if (m.type === "user_message") {
                  return {
                    id: `${m.timestamp ?? Date.now()}-user-hist`,
                    role: "user" as const,
                    content: m.content,
                    timestamp: m.timestamp ?? Date.now(),
                    source: "source" in m ? (m.source as string | undefined) : undefined,
                  };
                }
                // assistant message
                const content = (m.message?.content ?? [])
                  .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
                  .map((b) => b.text)
                  .join("");
                return {
                  id: `${m.timestamp ?? Date.now()}-ast-hist`,
                  role: "assistant" as const,
                  content,
                  timestamp: m.timestamp ?? Date.now(),
                };
              })
              .filter((m) => m.content.length > 0);

            setMessages((prev) => (prev.length === 0 ? historical : prev));
          }
          break;
        }

        case "context_update": {
          const ctx = msg as {
            type: "context_update";
            contextUsedPercent: number;
            totalTokens: number;
            maxTokens: number;
          };
          setSession(sessionId, {
            contextUsedPercent: ctx.contextUsedPercent,
            contextTokens: ctx.totalTokens,
            contextMaxTokens: ctx.maxTokens,
          });
          break;
        }

        case "cli_connected": {
          setWsStatus("connected");
          // If messages exist, this is a resume (not first connect)
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            // Check if the last system message is already a "resumed" message
            const last = prev[prev.length - 1];
            if (last?.role === "system" && last.content.includes("resumed")) return prev;
            return [
              ...prev,
              makeSystemMessage(`Session resumed — continuing from where it left off.`),
            ];
          });
          break;
        }

        case "cli_disconnected": {
          // Clear graph activity and pulse on session end
          useGraphActivityStore.getState().clear();
          usePulseStore.getState().clear(sessionId);

          // CLI process exited but WS may still be open; reflect in UI
          const exitCode = (msg as { exitCode?: number }).exitCode;
          const exitReason = (msg as { reason?: string }).reason;

          // Early/error exits → show "error" status so user sees what happened
          if (exitCode !== undefined && exitCode !== 0) {
            setSession(sessionId, { status: "error", shortId: undefined });
            sessionNotify(
              sessionId,
              "error",
              exitReason ?? `Session crashed (exit code ${exitCode})`,
              { duration: 8000 },
            );
            setMessages((prev) => {
              const hasEndMsg = prev.some(
                (m) =>
                  m.role === "system" &&
                  (m.content.includes("crashed") ||
                    m.content.includes("Session ended") ||
                    m.content.includes("Session completed")),
              );
              if (hasEndMsg) return prev;
              return [
                ...prev,
                makeSystemMessage(
                  `⚠ Session crashed unexpectedly. Send a message to resume from where it left off.`,
                ),
              ];
            });
          } else {
            setSession(sessionId, { status: "ended", shortId: undefined });
            // Don't inject "ended" message here — result handler already does it.
            // Only add if result handler didn't fire (e.g. idle timeout)
            setMessages((prev) => {
              const hasEndMsg = prev.some(
                (m) =>
                  m.role === "system" &&
                  (m.content.includes("Session ended") || m.content.includes("Session completed")),
              );
              if (hasEndMsg) return prev;
              return [
                ...prev,
                makeSystemMessage(`Session ended. Send a message to resume or close this session.`),
              ];
            });
          }

          if (exitReason) {
            addLog({
              sessionId,
              sessionName: getSessionName(),
              timestamp: Date.now(),
              type: "error",
              content: `CLI disconnected: ${exitReason}`,
            });
          }
          break;
        }

        case "idle_warning": {
          const remaining = (msg as { remainingMs?: number }).remainingMs ?? 300_000;
          const mins = Math.round(remaining / 60_000);
          const warningText = `Session will auto-stop in ${mins} minute${mins !== 1 ? "s" : ""} due to inactivity. Send a message to keep it alive.`;
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "warning",
            content: warningText,
          });
          sessionNotify(sessionId, "info", `Idle timeout: ${getSessionName()}`, {
            duration: 30_000,
          });
          // Show inline warning in chat feed (replace previous idle warning if any)
          setMessages((prev) => {
            const withoutOldWarning = prev.filter(
              (m) => !(m.role === "system" && m.content.includes("Idle timeout")),
            );
            return [
              ...withoutOldWarning,
              makeSystemMessage(
                `⏳ Idle timeout — session will auto-stop in ${mins} min. Send a message to keep it alive.`,
              ),
            ];
          });
          break;
        }

        case "tool_progress": {
          const elapsed = msg.elapsed_time_seconds;
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "tool_use",
            content: `${msg.tool_name} — running (${elapsed.toFixed(1)}s)`,
            meta: { toolName: msg.tool_name, toolUseId: msg.tool_use_id, elapsedSeconds: elapsed },
          });
          setSession(sessionId, { status: "busy" });
          break;
        }

        case "permission_cancelled": {
          setPendingPermissions((prev) => prev.filter((p) => p.requestId !== msg.request_id));
          break;
        }

        case "budget_warning": {
          const bwMsg = msg as {
            type: "budget_warning";
            budget: number;
            spent: number;
            percentage: number;
          };
          sessionNotify(
            sessionId,
            "info",
            `Budget at ${bwMsg.percentage}%: $${bwMsg.spent.toFixed(2)} / $${bwMsg.budget.toFixed(2)}`,
            { duration: 8000 },
          );
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "error",
            content: `Budget warning: $${bwMsg.spent.toFixed(2)} / $${bwMsg.budget.toFixed(2)} (${bwMsg.percentage}% used)`,
          });
          break;
        }

        case "budget_exceeded": {
          const beMsg = msg as { type: "budget_exceeded"; budget: number; spent: number };
          sessionNotify(
            sessionId,
            "error",
            `Budget exceeded — $${beMsg.spent.toFixed(2)} / $${beMsg.budget.toFixed(2)}`,
          );
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "error",
            content: `Budget exceeded: $${beMsg.spent.toFixed(2)} spent, $${beMsg.budget.toFixed(2)} limit. Message was not sent.`,
          });
          break;
        }

        case "hook_event": {
          const hook = msg as {
            type: "hook_event";
            hookType: string;
            toolName?: string;
            toolOutput?: string;
            toolError?: boolean;
            message?: string;
            timestamp: number;
          };
          const hookLabel = hook.toolName
            ? `[${hook.hookType}] ${hook.toolName}`
            : `[${hook.hookType}]${hook.message ? ` ${hook.message}` : ""}`;
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: hook.timestamp,
            type: hook.hookType === "Stop" ? "result" : "tool_use",
            content: hookLabel,
            meta: { hookType: hook.hookType, toolName: hook.toolName },
          });
          break;
        }

        case "error": {
          addLog({
            sessionId,
            sessionName: getSessionName(),
            timestamp: Date.now(),
            type: "error",
            content: (msg as { type: "error"; message: string }).message ?? "Unknown error",
          });
          break;
        }

        case "lock_status": {
          const ls = msg as {
            type: "lock_status";
            locked: boolean;
            owner: string | null;
            queueSize: number;
          };
          setLockStatus({ locked: ls.locked, owner: ls.owner, queueSize: ls.queueSize });
          break;
        }

        case "session_idle": {
          sessionNotify(sessionId, "info", `Session idle: ${getSessionName()}`);
          break;
        }

        case "prompt_scan": {
          const scan = msg as {
            type: "prompt_scan";
            risks: Array<{
              category: string;
              severity: string;
              description: string;
              matched: string;
            }>;
            blocked: boolean;
          };
          if (scan.blocked) {
            sessionNotify(sessionId, "error", "Prompt blocked by security scanner", {
              duration: 8000,
            });
          } else {
            sessionNotify(
              sessionId,
              "info",
              `Security scan: ${scan.risks.map((r) => r.description).join(", ")}`,
              { duration: 6000 },
            );
          }
          setLastScanResult(scan);
          break;
        }

        case "spectator_count": {
          const sc = msg as { type: "spectator_count"; count: number };
          setSpectatorCount(sc.count);
          break;
        }

        case "child_spawned": {
          const spawned = msg as {
            type: "child_spawned";
            childSessionId: string;
            childShortId: string;
            childName: string;
            childRole: string;
            childModel: string;
          };
          const store = useSessionStore.getState();
          // Register child session in store if not already there
          if (!store.sessions[spawned.childSessionId]) {
            store.setSession(spawned.childSessionId, {
              id: spawned.childSessionId,
              shortId: spawned.childShortId,
              projectSlug: store.sessions[sessionId]?.projectSlug ?? "",
              projectName: spawned.childName,
              model: spawned.childModel,
              status: "starting",
              state: {} as import("@companion/shared").SessionState,
              createdAt: Date.now(),
              parentSessionId: sessionId,
              brainRole: spawned.childRole as "specialist" | "researcher" | "reviewer",
              agentName: spawned.childName,
            });
          }
          store.addChildSession(sessionId, spawned.childSessionId);
          break;
        }

        case "child_ended": {
          const ended = msg as {
            type: "child_ended";
            childSessionId: string;
            childName: string;
            childRole: string;
            status: string;
          };
          const store = useSessionStore.getState();
          store.setSession(ended.childSessionId, { status: ended.status });
          break;
        }
      }

      // Handle context injection events (outside typed switch — custom event)
      const rawMsg = raw as { type: string; [key: string]: unknown };
      if (rawMsg.type === "context:injection") {
        useContextFeedStore.getState().pushEvent({
          sessionId: rawMsg.sessionId as string,
          injectionType: rawMsg.injectionType as
            | "project_map"
            | "message_context"
            | "plan_review"
            | "break_check"
            | "web_docs"
            | "activity_feed",
          summary: rawMsg.summary as string,
          charCount: rawMsg.charCount as number,
          tokenEstimate: rawMsg.tokenEstimate as number,
          timestamp: rawMsg.timestamp as number,
        });
      }

      // Handle graph:activity events for live CodeGraph visualization
      if (rawMsg.type === "graph:activity" && Array.isArray(rawMsg.nodeIds)) {
        useGraphActivityStore.getState().recordActivity({
          nodeIds: rawMsg.nodeIds as string[],
          filePaths: (rawMsg.filePaths as string[]) ?? [],
          toolName: (rawMsg.toolName as string) ?? "",
          toolAction: (rawMsg.toolAction as "read" | "modify" | "create") ?? "read",
        });
      }

      // Handle pulse:update events for agent operational health
      if (rawMsg.type === "pulse:update" && typeof rawMsg.score === "number") {
        usePulseStore.getState().pushReading(rawMsg.sessionId as string, {
          score: rawMsg.score as number,
          state: rawMsg.state as
            | "flow"
            | "focused"
            | "cautious"
            | "struggling"
            | "spiraling"
            | "blocked",
          trend: rawMsg.trend as "improving" | "stable" | "degrading",
          signals: rawMsg.signals as Record<string, number>,
          topSignal: rawMsg.topSignal as string,
          turn: rawMsg.turn as number,
          timestamp: rawMsg.timestamp as number,
        });
      }
    },
    [sessionId, setSession, addLog, getSessionName, flushStreamBuffer],
  );

  const { send } = useWebSocket({
    sessionId,
    onMessage: handleMessage,
    onStatusChange: setWsStatus,
  });

  const sendMessage = useCallback(
    (text: string, images?: Array<{ data: string; mediaType: string; name: string }>) => {
      setLastScanResult(null); // Clear previous scan result
      const msg: Message = {
        id: `${Date.now()}-user`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);

      send({
        type: "user_message",
        content: text,
        ...(images && images.length > 0 ? { images } : {}),
      });
    },
    [send],
  );

  const respondPermission = useCallback(
    (requestId: string, behavior: "allow" | "deny") => {
      setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
      send({ type: "permission_response", request_id: requestId, behavior });
    },
    [send],
  );

  const setModel = useCallback(
    (model: string) => {
      send({ type: "set_model", model });
    },
    [send],
  );

  const setThinkingMode = useCallback(
    (mode: ThinkingMode) => {
      send({ type: "set_thinking_mode", mode });
    },
    [send],
  );

  return {
    messages,
    pendingPermissions,
    wsStatus,
    lockStatus,
    lastScanResult,
    spectatorCount,
    sendMessage,
    respondPermission,
    setModel,
    setThinkingMode,
  };
}
