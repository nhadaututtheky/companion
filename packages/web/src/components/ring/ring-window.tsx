"use client";
import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useRingStore, type SharedMessage } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { getFanDirection, getBaseAngle } from "./fan-layout";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
const FAN_SIZE = 420; // diameter of the fan arc area
const FAN_SPREAD_DEG = 160;

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

/**
 * Generate CSS clip-path polygon for a fan/sector shape.
 * The pivot (ring orb) is at the bottom-center of the container.
 * Fan spreads upward as a semicircle.
 */
function fanClipPath(direction: string): string {
  const baseAngle = (() => {
    switch (direction) {
      case "up-left": return -135;
      case "up-right": return -45;
      case "down-left": return 135;
      case "down-right": return 45;
      default: return -135;
    }
  })();

  const halfSpread = FAN_SPREAD_DEG / 2;
  const startAngle = baseAngle - halfSpread;
  const endAngle = baseAngle + halfSpread;

  // Generate points along the arc
  const points: string[] = [];
  // Pivot point (center of container = where ring orb is)
  points.push("50% 50%");

  // Arc points (from start to end angle)
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (angle * Math.PI) / 180;
    const x = 50 + 50 * Math.cos(rad);
    const y = 50 + 50 * Math.sin(rad);
    points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }

  return `polygon(${points.join(", ")})`;
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
  const [open, setOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fan direction based on orb position
  const dir = getFanDirection(
    anchorX,
    anchorY,
    typeof window !== "undefined" ? window.innerWidth : 1920,
    typeof window !== "undefined" ? window.innerHeight : 1080,
  );

  // Open animation
  useEffect(() => {
    if (reducedMotion) { setOpen(true); return; }
    requestAnimationFrame(() => setOpen(true));
  }, [reducedMotion]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [sharedMessages]);

  // Position: fan container centered on ring orb
  const fanLeft = anchorX - FAN_SIZE / 2;
  const fanTop = anchorY - FAN_SIZE / 2;

  const clipPath = fanClipPath(dir);

  // Content card position relative to fan center — push away from pivot
  const baseAngle = getBaseAngle(dir);
  const rad = (baseAngle * Math.PI) / 180;
  const cardOffsetX = Math.cos(rad) * (FAN_SIZE * 0.25);
  const cardOffsetY = Math.sin(rad) * (FAN_SIZE * 0.25);

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
      {/* Fan-shaped background — clipped semicircle */}
      <div
        style={{
          position: "fixed",
          left: fanLeft,
          top: fanTop,
          width: FAN_SIZE,
          height: FAN_SIZE,
          zIndex: 42,
          clipPath,
          background: "var(--color-bg-card, rgba(245, 243, 239, 0.95))",
          backdropFilter: "blur(16px)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.15)",
          transform: open ? "scale(1)" : "scale(0)",
          transformOrigin: "50% 50%", // pivot = ring orb = center
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Session blade indicators along the arc */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          {linkedSessionIds.map((sid, i) => {
            const total = linkedSessionIds.length;
            const bladeAngle = baseAngle - FAN_SPREAD_DEG / 2 + ((i + 0.5) / total) * FAN_SPREAD_DEG;
            const bladeRad = (bladeAngle * Math.PI) / 180;
            const labelR = FAN_SIZE * 0.42;
            const lx = FAN_SIZE / 2 + labelR * Math.cos(bladeRad);
            const ly = FAN_SIZE / 2 + labelR * Math.sin(bladeRad);
            const session = sessions.find((s) => s.id === sid);
            const color = getSessionColor(sid);

            return (
              <div
                key={sid}
                style={{
                  position: "absolute",
                  left: lx - 30,
                  top: ly - 10,
                  width: 60,
                  textAlign: "center",
                  opacity: open ? 1 : 0,
                  transition: reducedMotion ? "none" : `opacity 0.3s ease ${0.3 + i * 0.1}s`,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, margin: "0 auto 2px" }} />
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-secondary, #555)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {session?.projectName ?? sid.slice(0, 6)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content card — positioned inside the fan area, away from pivot */}
      <div
        style={{
          position: "fixed",
          left: anchorX + cardOffsetX - 130,
          top: anchorY + cardOffsetY - 110,
          width: 260,
          height: 220,
          zIndex: 43,
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          background: "var(--color-bg-elevated, rgba(255,255,255,0.98))",
          border: "1px solid var(--color-border, rgba(0,0,0,0.06))",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          overflow: "hidden",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.8)",
          transformOrigin: `${50 - cardOffsetX / 2}% ${50 - cardOffsetY / 2}%`,
          transition: reducedMotion ? "none" : "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--color-border, rgba(0,0,0,0.06))", flexShrink: 0 }}>
          {linkedSessionIds.map((sid) => (
            <div key={sid} style={{ width: 7, height: 7, borderRadius: "50%", background: getSessionColor(sid) }} />
          ))}
          <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary, #555)" }}>
            {mode === "debate" ? "⚖️ Debate" : "Shared Context"}
          </span>
          <button
            onClick={() => setExpanded(false)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-text-muted, #999)", display: "flex" }}
            aria-label="Close fan"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        {/* Chat */}
        <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "4px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
          {sharedMessages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 4 }}>
              <span style={{ fontSize: 20, opacity: 0.25 }}>✦</span>
              <span style={{ fontSize: 10, color: "var(--color-text-muted, #999)", textAlign: "center" }}>
                Broadcast to linked sessions
              </span>
            </div>
          )}
          {sharedMessages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 1 }}>
              <span style={{ fontSize: 8, color: "var(--color-text-muted, #999)" }}>
                {msg.sessionName} · {formatTime(msg.timestamp)}
              </span>
              <div style={{
                fontSize: 11,
                lineHeight: 1.4,
                padding: "3px 7px",
                borderRadius: 7,
                maxWidth: "85%",
                background: msg.role === "user" ? "#4285F4" : "var(--color-bg-card, #f0f0f0)",
                color: msg.role === "user" ? "#fff" : "var(--color-text-primary, #333)",
                borderLeft: msg.role === "assistant" ? `2px solid ${msg.sessionColor}` : undefined,
              }}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 4, padding: "4px 6px", borderTop: "1px solid var(--color-border, rgba(0,0,0,0.06))", flexShrink: 0 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            style={{
              flex: 1, resize: "none", border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
              borderRadius: 7, padding: "4px 7px", fontSize: 11, outline: "none",
              background: "var(--color-bg-base, rgba(255,255,255,0.8))", color: "var(--color-text-primary, #333)",
              minHeight: 18, maxHeight: 50,
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            style={{
              background: "#4285F4", color: "#fff", border: "none", borderRadius: 7,
              padding: "0 8px", cursor: input.trim() ? "pointer" : "default",
              opacity: input.trim() ? 1 : 0.4, display: "flex", alignItems: "center",
            }}
            aria-label="Send"
          >
            <PaperPlaneTilt size={12} weight="fill" />
          </button>
        </div>
      </div>
    </>
  );
}
