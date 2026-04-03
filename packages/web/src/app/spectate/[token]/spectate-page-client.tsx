"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import {
  Eye,
  PencilSimple,
  CircleNotch,
  WarningCircle,
  PaperPlaneRight,
} from "@phosphor-icons/react";

// ── Types ──────────────────────────────────────────────────────────────────

interface SpectateInfo {
  sessionId: string;
  sessionName: string | null;
  permission: string;
  expiresAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  source?: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function SpectatePageClient({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<SpectateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Validate token
  useEffect(() => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    fetch(`${baseUrl}/api/share/${token}`)
      .then((res) => res.json())
      .then((data: { success: boolean; data?: SpectateInfo; error?: string }) => {
        if (data.success && data.data) {
          setInfo(data.data);
        } else {
          setError(data.error ?? "Invalid or expired share link");
        }
      })
      .catch(() => setError("Failed to validate share link"))
      .finally(() => setLoading(false));
  }, [token]);

  // Connect WebSocket with auto-reconnect
  useEffect(() => {
    if (!info) return;

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let intentionalClose = false;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/spectate/${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryCount = 0;
      };

      ws.onclose = (ev) => {
        setConnected(false);
        wsRef.current = null;
        if (intentionalClose) return;
        // Code 1000 = normal close (session ended, token revoked) — don't reconnect
        if (ev.code === 1000 || ev.code === 4429) {
          setError(ev.reason || "Session ended or share revoked");
          return;
        }
        // Exponential backoff reconnect
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // Will trigger onclose
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as Record<string, unknown>;
          const type = msg.type as string;

          if (type === "user_message") {
            const content = msg.content as string;
            const ts = msg.timestamp as number;
            const source = msg.source as string | undefined;
            setMessages((prev) => {
              const isDup = prev.some(
                (m) => m.role === "user" && m.timestamp === ts && m.content === content,
              );
              if (isDup) return prev;
              return [...prev, { id: `${ts}-user`, role: "user", content, timestamp: ts, source }];
            });
          } else if (type === "assistant_text" || type === "assistant_delta") {
            const content = (msg.content ?? msg.delta ?? "") as string;
            if (!content) return;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && Date.now() - last.timestamp < 30000) {
                return [...prev.slice(0, -1), { ...last, content: last.content + content }];
              }
              return [
                ...prev,
                {
                  id: `${Date.now()}-assistant`,
                  role: "assistant",
                  content,
                  timestamp: Date.now(),
                },
              ];
            });
          } else if (type === "tool_use") {
            const toolName = (msg.tool ?? msg.name ?? "tool") as string;
            setMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-tool`,
                role: "system",
                content: `Using tool: ${toolName}`,
                timestamp: Date.now(),
              },
            ]);
          }
        } catch {
          // Non-JSON or malformed — ignore
        }
      };
    }

    connect();

    return () => {
      intentionalClose = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [info, token]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(() => {
    if (!inputText.trim() || !wsRef.current || info?.permission !== "interactive") return;
    wsRef.current.send(JSON.stringify({ type: "user_message", content: inputText.trim() }));
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-user-self`,
        role: "user",
        content: inputText.trim(),
        timestamp: Date.now(),
        source: "spectator",
      },
    ]);
    setInputText("");
  }, [inputText, info]);

  // ── Loading / Error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0c1419", color: "#a0aeb8" }}
      >
        <div className="flex items-center gap-2">
          <CircleNotch size={20} className="animate-spin" />
          <span className="text-sm">Validating share link...</span>
        </div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0c1419", color: "#a0aeb8" }}
      >
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <WarningCircle size={48} style={{ color: "#EA4335" }} />
          <h1 className="text-lg font-semibold" style={{ color: "#fff" }}>
            Share Link Unavailable
          </h1>
          <p className="text-sm max-w-sm" style={{ color: "#a0aeb8" }}>
            {error ?? "This share link has expired or been revoked."}
          </p>
        </div>
      </div>
    );
  }

  // ── Main spectator view ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0c1419", color: "#fff" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid #2a3f52" }}
      >
        <div className="flex items-center gap-2">
          <Eye size={16} weight="bold" style={{ color: "#4285f4" }} aria-hidden="true" />
          <span className="text-sm font-semibold">{info.sessionName ?? "Live Session"}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              background: connected ? "#34A85320" : "#EA433520",
              color: connected ? "#34A853" : "#EA4335",
            }}
          >
            {connected ? "LIVE" : "Reconnecting..."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: info.permission === "interactive" ? "#a78bfa20" : "#4285f420",
              color: info.permission === "interactive" ? "#a78bfa" : "#4285f4",
            }}
          >
            {info.permission === "interactive" ? (
              <>
                <PencilSimple size={10} weight="bold" aria-hidden="true" /> Interactive
              </>
            ) : (
              <>
                <Eye size={10} weight="bold" aria-hidden="true" /> View only
              </>
            )}
          </span>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center" style={{ color: "#a0aeb8" }}>
            <span className="text-sm">Waiting for messages...</span>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="flex flex-col gap-1 max-w-3xl"
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                background:
                  msg.role === "user"
                    ? "#2196f320"
                    : msg.role === "system"
                      ? "#FBBC0410"
                      : "#1a2332",
                color: msg.role === "system" ? "#FBBC04" : "#fff",
                border: "1px solid #2a3f52",
                maxWidth: "80vw",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: "#a0aeb850" }}>
                {msg.role === "user"
                  ? msg.source === "spectator"
                    ? "You"
                    : "User"
                  : msg.role === "system"
                    ? "System"
                    : "Assistant"}
              </span>
              <span className="text-[10px]" style={{ color: "#a0aeb830" }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Interactive input */}
      {info.permission === "interactive" && (
        <div
          className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid #2a3f52" }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 text-sm px-3 py-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
            style={{
              background: "#1a2332",
              color: "#fff",
              border: "1px solid #2a3f52",
            }}
            disabled={!connected}
            aria-label="Message input"
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || !connected}
            className="p-2 rounded-xl cursor-pointer transition-colors disabled:opacity-30"
            style={{ background: "#2196f3", color: "#fff" }}
            aria-label="Send message"
          >
            <PaperPlaneRight size={16} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
