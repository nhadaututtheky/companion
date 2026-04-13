"use client";
import { useEffect, useRef, useCallback } from "react";

export type WsStatus = "connecting" | "connected" | "disconnected";
type MessageListener = (msg: unknown) => void;
type StatusListener = (status: WsStatus) => void;

const WS_BASE =
  typeof window !== "undefined"
    ? window.location.origin.replace(/^http/, "ws")
    : "ws://localhost:3579";

// ── Singleton WS connection per sessionId ────────────────────────────────────

interface SharedWs {
  ws: WebSocket | null;
  status: WsStatus;
  refCount: number;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  messageListeners: Set<MessageListener>;
  statusListeners: Set<StatusListener>;
}

const connections = new Map<string, SharedWs>();

function getOrCreate(sessionId: string): SharedWs {
  let shared = connections.get(sessionId);
  if (!shared) {
    shared = {
      ws: null,
      status: "disconnected",
      refCount: 0,
      retryCount: 0,
      retryTimer: null,
      messageListeners: new Set(),
      statusListeners: new Set(),
    };
    connections.set(sessionId, shared);
  }
  return shared;
}

function setStatus(shared: SharedWs, status: WsStatus): void {
  shared.status = status;
  for (const listener of shared.statusListeners) {
    listener(status);
  }
}

function connect(sessionId: string): void {
  const shared = getOrCreate(sessionId);
  if (shared.ws?.readyState === WebSocket.OPEN || shared.ws?.readyState === WebSocket.CONNECTING) {
    return; // already connected or connecting
  }

  const apiKey = localStorage.getItem("api_key") ?? "";
  const url = `${WS_BASE}/ws/${sessionId}`;
  const ws = new WebSocket(url, apiKey || undefined);
  shared.ws = ws;
  setStatus(shared, "connecting");

  ws.onopen = () => {
    shared.retryCount = 0;
    setStatus(shared, "connected");
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      for (const listener of shared.messageListeners) {
        listener(msg);
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onclose = (ev) => {
    shared.ws = null;
    setStatus(shared, "disconnected");

    // Don't retry if no subscribers left or permanent close
    if (shared.refCount <= 0) return;
    if (ev.code === 4001 || ev.code === 4004) return;
    if (shared.retryCount >= 10) return;

    const delay = Math.min(1000 * Math.pow(2, shared.retryCount++), 30_000);
    shared.retryTimer = setTimeout(() => {
      shared.retryTimer = null;
      if (shared.refCount > 0) connect(sessionId);
    }, delay);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function subscribe(
  sessionId: string,
  onMessage: MessageListener,
  onStatus: StatusListener,
): () => void {
  const shared = getOrCreate(sessionId);
  shared.messageListeners.add(onMessage);
  shared.statusListeners.add(onStatus);
  shared.refCount++;

  // Connect if this is the first subscriber
  if (shared.refCount === 1) {
    connect(sessionId);
  } else {
    // Late subscriber: immediately notify current status
    onStatus(shared.status);
  }

  // Return unsubscribe function
  return () => {
    shared.messageListeners.delete(onMessage);
    shared.statusListeners.delete(onStatus);
    shared.refCount--;

    if (shared.refCount <= 0) {
      // Last subscriber left — tear down connection
      shared.refCount = 0;
      if (shared.retryTimer) {
        clearTimeout(shared.retryTimer);
        shared.retryTimer = null;
      }
      shared.ws?.close();
      shared.ws = null;
      connections.delete(sessionId);
    }
  };
}

function send(sessionId: string, data: unknown): void {
  const shared = connections.get(sessionId);
  if (shared?.ws?.readyState === WebSocket.OPEN) {
    shared.ws.send(JSON.stringify(data));
  }
}

// ── React hook (drop-in replacement) ─────────────────────────────────────────

interface UseWebSocketOptions {
  sessionId: string;
  onMessage: (msg: unknown) => void;
  onStatusChange?: (s: WsStatus) => void;
  enabled?: boolean;
}

export function useWebSocket({
  sessionId,
  onMessage,
  onStatusChange,
  enabled = true,
}: UseWebSocketOptions) {
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatusChange);
  onMessageRef.current = onMessage;
  onStatusRef.current = onStatusChange;

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const unsubscribe = subscribe(
      sessionId,
      (msg) => onMessageRef.current(msg),
      (status) => onStatusRef.current?.(status),
    );

    return unsubscribe;
  }, [sessionId, enabled]);

  const sendFn = useCallback(
    (data: unknown) => {
      if (sessionId) send(sessionId, data);
    },
    [sessionId],
  );

  return { send: sendFn };
}
