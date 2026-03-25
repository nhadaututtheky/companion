"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket } from "./use-websocket";
import { useSessionStore } from "@/lib/stores/session-store";
import { useActivityStore } from "@/lib/stores/activity-store";
import type { BrowserIncomingMessage, ContentBlock, SessionState } from "@companion/shared";

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
}

export function useSession(sessionId: string): UseSessionReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const setSession = useSessionStore((s) => s.setSession);
  const addLog = useActivityStore((s) => s.addLog);

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
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + buffered },
        ];
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
            .filter((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result")
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

          // Get cost from usage
          const usage = msg.message?.usage;
          const costUsd = usage
            ? (usage.input_tokens * 0.000003 + usage.output_tokens * 0.000015) // approximate
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
                return [
                  ...prev.slice(0, -1),
                  { ...last, ...messageData },
                ];
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
          const req = msg.request as { request_id: string; tool_name: string; description?: string };
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
          if (msg.messages && Array.isArray(msg.messages)) {
            const historical: Message[] = msg.messages
              .filter(
                (
                  m,
                ): m is Extract<
                  typeof m,
                  { type: "assistant" | "user_message" }
                > => m.type === "assistant" || m.type === "user_message",
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
                  .filter(
                    (b): b is Extract<ContentBlock, { type: "text" }> =>
                      b.type === "text",
                  )
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

            setMessages((prev) =>
              prev.length === 0 ? historical : prev,
            );
          }
          break;
        }

        case "context_update": {
          // Token state is already refreshed via session_update from the server.
          // This event is primarily for Telegram compact warnings.
          // No additional store update needed here.
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
          setPendingPermissions((prev) =>
            prev.filter((p) => p.requestId !== msg.request_id),
          );
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

  return { messages, pendingPermissions, wsStatus, sendMessage, respondPermission };
}
