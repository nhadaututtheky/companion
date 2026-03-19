"use client";
import { useEffect, useRef, useCallback } from "react";

type WsStatus = "connecting" | "connected" | "disconnected";

interface UseWebSocketOptions {
  sessionId: string;
  onMessage: (msg: unknown) => void;
  onStatusChange?: (s: WsStatus) => void;
  enabled?: boolean;
}

const WS_BASE =
  typeof window !== "undefined"
    ? window.location.origin.replace(/^http/, "ws")
    : "ws://localhost:3579";

export function useWebSocket({
  sessionId,
  onMessage,
  onStatusChange,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);

  onMessageRef.current = onMessage;
  onStatusRef.current = onStatusChange;

  const connect = useCallback(() => {
    if (!enabled || !sessionId) return;

    const apiKey = localStorage.getItem("api_key") ?? "";
    const url = `${WS_BASE}/ws/${sessionId}`;

    // Send API key via Sec-WebSocket-Protocol header (not URL query — avoids credential leaks in logs)
    const ws = new WebSocket(url, apiKey || undefined);
    wsRef.current = ws;
    onStatusRef.current?.("connecting");

    ws.onopen = () => {
      retryRef.current = 0;
      onStatusRef.current?.("connected");
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onMessageRef.current(msg);
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      onStatusRef.current?.("disconnected");
      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * Math.pow(2, retryRef.current++), 30_000);
      retryTimerRef.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId, enabled]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { send };
}
