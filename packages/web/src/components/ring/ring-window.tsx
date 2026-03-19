"use client";
import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { ArrowsIn, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useRingStore, type SharedMessage } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return GOOGLE_COLORS[Math.abs(hash) % GOOGLE_COLORS.length]!;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ msg }: { msg: SharedMessage }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 8,
        }}
      >
        <div style={{ maxWidth: "80%" }}>
          <div
            style={{
              background: "#4285F4",
              color: "#fff",
              borderRadius: "12px 12px 4px 12px",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              lineHeight: 1.4,
            }}
          >
            {msg.content}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
              textAlign: "right",
              marginTop: 2,
            }}
          >
            {formatTime(msg.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 8,
        alignItems: "flex-start",
      }}
    >
      {/* Session color bar */}
      <div
        style={{
          width: 3,
          alignSelf: "stretch",
          minHeight: 32,
          borderRadius: 2,
          background: msg.sessionColor,
          flexShrink: 0,
          marginTop: 2,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: msg.sessionColor,
            marginBottom: 2,
            fontFamily: "var(--font-body)",
          }}
        >
          {msg.sessionName}
        </div>
        <div
          style={{
            background: "var(--color-bg-elevated)",
            borderRadius: "4px 12px 12px 12px",
            padding: "8px 12px",
            fontSize: 13,
            fontFamily: "var(--font-body)",
            color: "var(--color-text-primary)",
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        >
          {msg.content}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          {formatTime(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

interface RingWindowProps {
  anchorX: number;
  anchorY: number;
}

export function RingWindow({ anchorX, anchorY }: RingWindowProps) {
  const linkedSessionIds = useRingStore((s) => s.linkedSessionIds);
  const topic = useRingStore((s) => s.topic);
  const sharedMessages = useRingStore((s) => s.sharedMessages);
  const addSharedMessage = useRingStore((s) => s.addSharedMessage);
  const setExpanded = useRingStore((s) => s.setExpanded);
  const sessions = useSessionStore((s) => s.sessions);
  const [input, setInput] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cardWidth = 500;
  const cardHeight = 400;
  const padding = 16;

  // Compute position: prefer left of ring, adjust to stay on screen
  let left = anchorX - cardWidth - padding;
  let top = anchorY - cardHeight / 2;

  if (typeof window !== "undefined") {
    if (left < 8) left = anchorX + 60 + padding;
    if (top < 8) top = 8;
    if (top + cardHeight > window.innerHeight - 8) {
      top = window.innerHeight - cardHeight - 8;
    }
    if (left + cardWidth > window.innerWidth - 8) {
      left = window.innerWidth - cardWidth - 8;
    }
  }

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sharedMessages]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isBroadcasting || linkedSessionIds.length === 0) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Add user message to shared history
    addSharedMessage({
      id: `user-${Date.now()}`,
      sessionId: "user",
      sessionName: "You",
      sessionColor: "#4285F4",
      content,
      timestamp: Date.now(),
      role: "user",
    });

    setIsBroadcasting(true);
    toast(`Broadcasting to ${linkedSessionIds.length} session${linkedSessionIds.length > 1 ? "s" : ""}…`, {
      duration: 2000,
    });

    // Broadcast to each linked session
    const results = await Promise.allSettled(
      linkedSessionIds.map((id) => api.sessions.message(id, content)),
    );

    setIsBroadcasting(false);

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(`Failed to send to ${failed} session${failed > 1 ? "s" : ""}`);
    }

    // For v1: show a confirmation message per session (not actual responses)
    for (const sid of linkedSessionIds) {
      const session = sessions[sid];
      if (!session) continue;
      const color = getSessionColor(sid);
      addSharedMessage({
        id: `sent-${sid}-${Date.now()}`,
        sessionId: sid,
        sessionName: session.projectName,
        sessionColor: color,
        content: "Message sent — response appearing in session terminal.",
        timestamp: Date.now(),
        role: "assistant",
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  };

  const linkedSessions = linkedSessionIds.map((id) => ({
    id,
    session: sessions[id],
    color: getSessionColor(id),
  }));

  return (
    <div
      role="dialog"
      aria-label={`Magic Ring — ${topic || "Shared Context"}`}
      style={{
        position: "fixed",
        left,
        top,
        width: cardWidth,
        height: cardHeight,
        zIndex: 42,
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1)",
        /* Glassmorphism */
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(66,133,244,0.2)",
      }}
      className="dark:bg-glass-dark"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border)",
          background: "rgba(255,255,255,0.5)",
          flexShrink: 0,
        }}
      >
        {/* Session color dots */}
        <div style={{ display: "flex", gap: 4 }}>
          {linkedSessions.map(({ id, color }) => (
            <div
              key={id}
              title={sessions[id]?.projectName ?? id}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: color,
                border: "1.5px solid rgba(0,0,0,0.1)",
              }}
            />
          ))}
        </div>

        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {topic || "Shared Context"}
        </span>

        <button
          onClick={() => setExpanded(false)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
            padding: 4,
            borderRadius: 6,
          }}
          aria-label="Collapse ring window"
        >
          <ArrowsIn size={14} weight="bold" />
        </button>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {sharedMessages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(66,133,244,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 16 }}>✦</span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                textAlign: "center",
                margin: 0,
              }}
            >
              Broadcast a message to all {linkedSessionIds.length} linked session{linkedSessionIds.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
        {sharedMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      {/* Input bar */}
      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "8px 12px",
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          flexShrink: 0,
          background: "rgba(255,255,255,0.5)",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "flex-end",
            gap: 4,
            borderRadius: 10,
            padding: "6px 10px",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-card)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={isBroadcasting}
            placeholder={
              isBroadcasting
                ? "Broadcasting…"
                : `Broadcast to ${linkedSessionIds.length} session${linkedSessionIds.length !== 1 ? "s" : ""}…`
            }
            rows={1}
            aria-label="Broadcast message"
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              outline: "none",
              border: "none",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              color: "var(--color-text-primary)",
              lineHeight: 1.4,
              maxHeight: 80,
              minHeight: 20,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isBroadcasting || linkedSessionIds.length === 0}
            style={{
              flexShrink: 0,
              padding: 6,
              borderRadius: 8,
              border: "none",
              background: input.trim() && !isBroadcasting ? "#4285F4" : "var(--color-bg-elevated)",
              color: input.trim() && !isBroadcasting ? "#fff" : "var(--color-text-muted)",
              cursor: input.trim() && !isBroadcasting ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Send broadcast"
          >
            <PaperPlaneTilt size={14} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}
