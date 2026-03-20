"use client";
import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useRingStore, type SharedMessage } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { getFanDirection } from "./fan-layout";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
const FAN_RADIUS = 380;
const FAN_SPREAD_DEG = 150;

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
 * Fan layout: pivot at corner touching the ring orb, fan radiates away.
 */
function computeFanLayout(dir: string, anchorX: number, anchorY: number) {
  const baseAngle = dir === "up-left" ? -135 : dir === "up-right" ? -45 : dir === "down-left" ? 135 : 45;
  const px = (dir === "up-left" || dir === "down-left") ? 1 : 0;
  const py = (dir === "up-left" || dir === "up-right") ? 1 : 0;
  const pivotX = `${px * 100}%`;
  const pivotY = `${py * 100}%`;

  const left = anchorX - FAN_RADIUS * px;
  const top = anchorY - FAN_RADIUS * py;

  const halfSpread = FAN_SPREAD_DEG / 2;
  const startAngle = baseAngle - halfSpread;
  const endAngle = baseAngle + halfSpread;
  const points: string[] = [`${px * 100}% ${py * 100}%`];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (angle * Math.PI) / 180;
    points.push(`${(px * 100 + 100 * Math.cos(rad)).toFixed(1)}% ${(py * 100 + 100 * Math.sin(rad)).toFixed(1)}%`);
  }

  return { left, top, pivotX, pivotY, baseAngle, px, py, clipPath: `polygon(${points.join(", ")})` };
}

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

  const dir = getFanDirection(
    anchorX, anchorY,
    typeof window !== "undefined" ? window.innerWidth : 1920,
    typeof window !== "undefined" ? window.innerHeight : 1080,
  );

  const fan = computeFanLayout(dir, anchorX, anchorY);

  useEffect(() => {
    if (reducedMotion) { setOpen(true); return; }
    requestAnimationFrame(() => setOpen(true));
  }, [reducedMotion]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [sharedMessages]);

  // Content card offset: push into the fan area
  const cardRad = (fan.baseAngle * Math.PI) / 180;
  const cardDist = FAN_RADIUS * 0.4;
  const cardX = anchorX + Math.cos(cardRad) * cardDist - 130;
  const cardY = anchorY + Math.sin(cardRad) * cardDist - 110;

  async function handleSend() {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    addSharedMessage({
      id: `user-${Date.now()}`, sessionId: "user", sessionName: "You",
      sessionColor: "#4285F4", content, timestamp: Date.now(), role: "user",
    });

    try {
      for (const sid of linkedSessionIds) {
        await api.sessions.message(sid, content);
        const session = sessions.find((s) => s.id === sid);
        addSharedMessage({
          id: `confirm-${sid}-${Date.now()}`, sessionId: sid,
          sessionName: session?.projectName ?? sid.slice(0, 8),
          sessionColor: getSessionColor(sid),
          content: "Message sent — response in session terminal.",
          timestamp: Date.now(), role: "assistant",
        });
      }
      toast.success(`Broadcasting to ${linkedSessionIds.length} session(s)…`);
    } catch (err) { toast.error(String(err)); }
    finally { setSending(false); }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  }

  return (
    <>
      {/* Fan-shaped background — pivot at ring orb corner */}
      <div
        style={{
          position: "fixed",
          left: fan.left,
          top: fan.top,
          width: FAN_RADIUS,
          height: FAN_RADIUS,
          zIndex: 42,
          clipPath: fan.clipPath,
          background: "var(--color-bg-card, rgba(245, 243, 239, 0.95))",
          backdropFilter: "blur(16px)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.15)",
          transform: open ? "scale(1)" : "scale(0)",
          transformOrigin: `${fan.pivotX} ${fan.pivotY}`,
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Session labels along the arc */}
        {linkedSessionIds.map((sid, i) => {
          const total = linkedSessionIds.length;
          const angle = fan.baseAngle - FAN_SPREAD_DEG / 2 + ((i + 0.5) / total) * FAN_SPREAD_DEG;
          const aRad = (angle * Math.PI) / 180;
          const labelR = FAN_RADIUS * 0.7;
          const lx = fan.px * FAN_RADIUS + labelR * Math.cos(aRad);
          const ly = fan.py * FAN_RADIUS + labelR * Math.sin(aRad);
          const session = sessions.find((s) => s.id === sid);
          const color = getSessionColor(sid);

          return (
            <div
              key={sid}
              style={{
                position: "absolute", left: lx - 30, top: ly - 10, width: 60,
                textAlign: "center", opacity: open ? 1 : 0,
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

      {/* Content card — inside the fan area */}
      <div
        style={{
          position: "fixed",
          left: Math.max(8, Math.min(cardX, (typeof window !== "undefined" ? window.innerWidth : 1920) - 268)),
          top: Math.max(8, Math.min(cardY, (typeof window !== "undefined" ? window.innerHeight : 1080) - 228)),
          width: 260, height: 220, zIndex: 43,
          display: "flex", flexDirection: "column",
          borderRadius: 14,
          background: "var(--color-bg-elevated, rgba(255,255,255,0.98))",
          border: "1px solid var(--color-border, rgba(0,0,0,0.06))",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          overflow: "hidden",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.8)",
          transformOrigin: `${fan.pivotX} ${fan.pivotY}`,
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
          <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-text-muted, #999)", display: "flex" }} aria-label="Close">
            <X size={12} weight="bold" />
          </button>
        </div>

        {/* Chat */}
        <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "4px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
          {sharedMessages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 4 }}>
              <span style={{ fontSize: 20, opacity: 0.25 }}>✦</span>
              <span style={{ fontSize: 10, color: "var(--color-text-muted, #999)", textAlign: "center" }}>Broadcast to linked sessions</span>
            </div>
          )}
          {sharedMessages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 1 }}>
              <span style={{ fontSize: 8, color: "var(--color-text-muted, #999)" }}>{msg.sessionName} · {formatTime(msg.timestamp)}</span>
              <div style={{
                fontSize: 11, lineHeight: 1.4, padding: "3px 7px", borderRadius: 7, maxWidth: "85%",
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
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Message…" rows={1}
            style={{ flex: 1, resize: "none", border: "1px solid var(--color-border, rgba(0,0,0,0.08))", borderRadius: 7, padding: "4px 7px", fontSize: 11, outline: "none", background: "var(--color-bg-base, rgba(255,255,255,0.8))", color: "var(--color-text-primary, #333)", minHeight: 18, maxHeight: 50 }}
          />
          <button
            onClick={() => void handleSend()} disabled={sending || !input.trim()}
            style={{ background: "#4285F4", color: "#fff", border: "none", borderRadius: 7, padding: "0 8px", cursor: input.trim() ? "pointer" : "default", opacity: input.trim() ? 1 : 0.4, display: "flex", alignItems: "center" }}
            aria-label="Send"
          >
            <PaperPlaneTilt size={12} weight="fill" />
          </button>
        </div>
      </div>
    </>
  );
}
