"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket } from "./use-websocket";
import { useSessionStore } from "@/lib/stores/session-store";
import { useActivityStore } from "@/lib/stores/activity-store";
import { notify } from "./use-notifications";
import { api } from "@/lib/api-client";
import type { BrowserIncomingMessage, ContentBlock, SessionState, ThinkingMode } from "@companion/shared";

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
}

interface PermissionRequest {
  requestId: string;
  toolName: string;
  description?: string;
}

interface UseSessionReturn {
  messages: Message[];
  pendingPermissions: PermissionRequest[];
  wsStatus: "connecting" | "connected" | "disconnected";
  sendMessage: (text: string) => void;
  respondPermission: (requestId: string, behavior: "allow" | "deny") => void;
  setModel: (model: string) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
}

export function useSession(sessionId: string): UseSessionReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">(
    "disconnected",
  );
  const setSession = useSessionStore((s) => s.setSession);
  const addLog = useActivityStore((s) => s.addLog);
  // Track whether WS message_history replay populated messages
  const historyReceivedRef = useRef(false);
  // Ref for REST fallback timer so it can be cleared across effect re-runs
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Stream buffering: accumulate tokens, flush every 50ms ──
  const streamBufferRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushStreamBuffer = useCallback(() => {
    flushTimerRef.current = null;
    const buffered = streamBufferRef.current;
    if (!buffered) return;
    streamBufferRef.current = "";

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.isStreaming && last.role === "assistant") {
        return [...prev.slice(0, -1), { ...last, content: last.content + buffered }];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-stream`,
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
          const MODEL_RATES: Record<string, { input: number; output: number }> = {
            "claude-haiku-4-5": { input: 0.8 / 1_000_000, output: 4.0 / 1_000_000 },
            "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
            "claude-opus-4-6": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
          };
          const sessionModel = useSessionStore.getState().sessions[sessionId]?.model ?? "";
          const rates = MODEL_RATES[sessionModel] ?? MODEL_RATES["claude-sonnet-4-6"]!;
          const usage = msg.message?.usage;
          const costUsd = usage
            ? usage.input_tokens * rates.input + usage.output_tokens * rates.output
            : undefined;

          const messageData = {
            id: `${Date.now()}-ast`,
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
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              // Always replace last assistant message (handles partial + final)
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, ...messageData }];
              }
              return [...prev, messageData];
            });
          }
          break;
        }

        case "stream_event": {
          const event = msg.event as {
            type?: string;
            delta?: { text?: string; type?: string; thinking?: string };
            content_block?: { type?: string };
          };
          const text = event?.delta?.text ?? "";

          // Log thinking blocks
          if (
            event?.type === "content_block_start" &&
            (event as { content_block?: { type?: string } }).content_block?.type === "thinking"
          ) {
            addLog({
              sessionId,
              sessionName: getSessionName(),
              timestamp: Date.now(),
              type: "thinking",
              content: "Thinking...",
            });
          } else if (event?.delta?.type === "thinking_delta" && event.delta.thinking) {
            addLog({
              sessionId,
              sessionName: getSessionName(),
              timestamp: Date.now(),
              type: "thinking",
              content: event.delta.thinking.slice(0, 120),
            });
          }

          if (text) {
            // Buffer tokens and flush every 50ms to reduce re-renders
            streamBufferRef.current += text;
            if (!flushTimerRef.current) {
              flushTimerRef.current = setTimeout(flushStreamBuffer, 50);
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
            if (last?.isStreaming) {
              return [...prev.slice(0, -1), { ...last, isStreaming: false }];
            }
            return prev;
          });
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
          break;
        }

        case "cli_disconnected": {
          // CLI process exited but WS may still be open; reflect in UI
          const exitCode = (msg as { exitCode?: number }).exitCode;
          const exitReason = (msg as { reason?: string }).reason;

          // Early/error exits → show "error" status so user sees what happened
          if (exitCode !== undefined && exitCode !== 0) {
            setSession(sessionId, { status: "error", shortId: undefined });
          } else {
            setSession(sessionId, { status: "ended", shortId: undefined });
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
          import("sonner").then(({ toast }) => {
            toast.warning(
              `Budget at ${bwMsg.percentage}%: $${bwMsg.spent.toFixed(2)} / $${bwMsg.budget.toFixed(2)}`,
              {
                description:
                  "Approaching session cost budget. Increase budget in settings if needed.",
                duration: 8000,
              },
            );
          });
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
          import("sonner").then(({ toast }) => {
            toast.error(
              `Budget exceeded — $${beMsg.spent.toFixed(2)} / $${beMsg.budget.toFixed(2)}`,
              {
                description: "Increase your budget in session settings to continue.",
                duration: 0,
              },
            );
          });
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
    (text: string) => {
      const msg: Message = {
        id: `${Date.now()}-user`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);

      send({ type: "user_message", content: text });
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

  return { messages, pendingPermissions, wsStatus, sendMessage, respondPermission, setModel, setThinkingMode };
}
