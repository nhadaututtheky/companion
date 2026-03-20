"use client";
import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useRingStore, type SharedMessage } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import {
  FAN_RADIUS,
  FAN_INNER_RADIUS,
  getFanDirection,
  getBladeAngles,
  bladePath,
  bladeLabelPosition,
  getContentCenter,
} from "./fan-layout";

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

// ── Fan Window ─────────────────────────────────────────────────────────────

interface RingWindowProps {
  anchorX: number;
  anchorY: number;
}

export function RingWindow({ anchorX, anchorY }: RingWindowProps) {
  const linkedSessionIds = useRingStore((s) => s.linkedSessionIds);
  const sharedMessages = useRingStore((s) => s.sharedMessages);
  const addSharedMessage = useRingStore((s) => s.addSharedMessage);
  const setExpanded = useRingStore((s) => s.setExpanded);
  const mode = useRingStore((s) => s.mode);
  const sessionsMap = useSessionStore((s) => s.sessions);
  const sessions = Object.values(sessionsMap);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [animating, setAnimating] = useState(true);
  const chatRef = useRef<HTMLDivElement>(null);

  // Fan direction based on orb position
  const dir = getFanDirection(
    anchorX,
    anchorY,
    typeof window !== "undefined" ? window.innerWidth : 1920,
    typeof window !== "undefined" ? window.innerHeight : 1080,
  );

  const blades = getBladeAngles(linkedSessionIds.length, dir);
  const contentPos = getContentCenter(dir, FAN_RADIUS * 0.45);

  // Animation: staggered fan open
  useEffect(() => {
    const timer = setTimeout(() => setAnimating(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [sharedMessages]);

  const svgSize = FAN_RADIUS * 2 + 40;
  const center = svgSize / 2;

  // Calculate SVG position so the center aligns with the ring orb
  const svgLeft = anchorX - center;
  const svgTop = anchorY - center;

  // Content overlay position (absolute, over the SVG)
  const contentLeft = anchorX + contentPos.x - 140;
  const contentTop = anchorY + contentPos.y - 120;

  async function handleSend() {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    addSharedMessage({
      id: `user-${Date.now()}`,
      sessionId: "user",
      sessionName: "You",
      sessionColor: "#4285F4",
      content,
      timestamp: Date.now(),
      role: "user",
    });

    try {
      for (const sid of linkedSessionIds) {
        await api.sessions.message(sid, content);
        const session = sessions.find((s) => s.id === sid);
        addSharedMessage({
          id: `confirm-${sid}-${Date.now()}`,
          sessionId: sid,
          sessionName: session?.projectName ?? sid.slice(0, 8),
          sessionColor: getSessionColor(sid),
          content: "Message sent — response in session terminal.",
          timestamp: Date.now(),
          role: "assistant",
        });
      }
      toast.success(`Broadcasting to ${linkedSessionIds.length} session(s)…`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      {/* SVG Fan Blades */}
      <svg
        width={svgSize}
        height={svgSize}
        style={{
          position: "fixed",
          left: svgLeft,
          top: svgTop,
          zIndex: 42,
          pointerEvents: "none",
          overflow: "visible",
        }}
        aria-hidden="true"
      >
        <defs>
          <filter id="fan-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.15" />
          </filter>
        </defs>
        <g transform={`translate(${center}, ${center})`} filter="url(#fan-shadow)">
          {blades.map((blade, i) => {
            const sid = linkedSessionIds[i] ?? "";
            const color = getSessionColor(sid);
            const session = sessions.find((s) => s.id === sid);
            const label = session?.projectName ?? sid.slice(0, 8);
            const labelPos = bladeLabelPosition(blade.midAngle, FAN_RADIUS * 0.75);

            // Staggered animation delay
            const delay = i * 0.08;
            const bladeStyle = animating
              ? {
                  opacity: 0,
                  transform: `rotate(${-20}deg)`,
                  transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
                }
              : {
                  opacity: 1,
                  transform: "rotate(0deg)",
                  transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
                };

            return (
              <g key={sid || i} style={bladeStyle}>
                {/* Blade shape */}
                <path
                  d={bladePath(blade.startAngle, blade.endAngle)}
                  fill="rgba(245, 243, 239, 0.92)"
                  stroke={color}
                  strokeWidth={1.5}
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                />

                {/* Colored inner edge (bamboo rib) */}
                <path
                  d={bladePath(blade.startAngle, blade.endAngle, FAN_INNER_RADIUS, FAN_INNER_RADIUS + 4)}
                  fill={color}
                  opacity={0.6}
                />

                {/* Session label */}
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fontWeight={600}
                  fontFamily="var(--font-sans)"
                  fill="var(--color-text-secondary, #555)"
                  style={{ pointerEvents: "none" }}
                >
                  {label}
                </text>

                {/* Model badge */}
                <text
                  x={labelPos.x}
                  y={labelPos.y + 14}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="var(--color-text-muted, #999)"
                  style={{ pointerEvents: "none" }}
                >
                  {session?.model?.split("-").pop() ?? ""}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Content overlay — messages + input */}
      <div
        style={{
          position: "fixed",
          left: Math.max(8, Math.min(contentLeft, (typeof window !== "undefined" ? window.innerWidth : 1920) - 296)),
          top: Math.max(8, Math.min(contentTop, (typeof window !== "undefined" ? window.innerHeight : 1080) - 260)),
          width: 280,
          height: 240,
          zIndex: 43,
          display: "flex",
          flexDirection: "column",
          borderRadius: 16,
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          opacity: animating ? 0 : 1,
          transform: animating ? "scale(0.8)" : "scale(1)",
          transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 10px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            flexShrink: 0,
          }}
        >
          {linkedSessionIds.map((sid) => (
            <div
              key={sid}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: getSessionColor(sid),
              }}
            />
          ))}
          <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary, #555)" }}>
            {mode === "debate" ? "⚖️ Debate" : "Shared Context"}
          </span>
          <button
            onClick={() => setExpanded(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              color: "var(--color-text-muted, #999)",
              display: "flex",
            }}
            aria-label="Close fan"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        {/* Chat area */}
        <div
          ref={chatRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "6px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {sharedMessages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6 }}>
              <span style={{ fontSize: 24, opacity: 0.3 }}>✦</span>
              <span style={{ fontSize: 11, color: "var(--color-text-muted, #999)", textAlign: "center" }}>
                Type to broadcast to all linked sessions
              </span>
            </div>
          )}
          {sharedMessages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 1,
              }}
            >
              <span style={{ fontSize: 9, color: "var(--color-text-muted, #999)" }}>
                {msg.sessionName} · {formatTime(msg.timestamp)}
              </span>
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.4,
                  padding: "4px 8px",
                  borderRadius: 8,
                  maxWidth: "85%",
                  background: msg.role === "user" ? "#4285F4" : "var(--color-bg-elevated, #f0f0f0)",
                  color: msg.role === "user" ? "#fff" : "var(--color-text-primary, #333)",
                  borderLeft: msg.role === "assistant" ? `3px solid ${msg.sessionColor}` : undefined,
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "6px 8px",
            borderTop: "1px solid rgba(0,0,0,0.06)",
            flexShrink: 0,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Broadcast message…"
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 8,
              padding: "5px 8px",
              fontSize: 12,
              outline: "none",
              background: "rgba(255,255,255,0.8)",
              color: "var(--color-text-primary, #333)",
              minHeight: 20,
              maxHeight: 60,
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            style={{
              background: "#4285F4",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0 10px",
              cursor: input.trim() ? "pointer" : "default",
              opacity: input.trim() ? 1 : 0.4,
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Send broadcast"
          >
            <PaperPlaneTilt size={14} weight="fill" />
          </button>
        </div>
      </div>
    </>
  );
}
