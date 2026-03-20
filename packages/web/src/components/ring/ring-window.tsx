"use client";
import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { PaperPlaneTilt, X } from "@phosphor-icons/react";
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

  useEffect(() => {
    if (reducedMotion) { setOpen(true); return; }
    requestAnimationFrame(() => setOpen(true));
  }, [reducedMotion]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [sharedMessages]);

  // Arc layout: linked session bubbles above ring
  const arcRadius = 80;
  const totalArc = Math.min(linkedSessionIds.length * 45, 160);
  const startAngle = -90 - totalArc / 2;

  // Card position: above the arc bubbles
  const cardBottom = typeof window !== "undefined" ? window.innerHeight - anchorY + 30 + arcRadius : 200;
  const cardRight = typeof window !== "undefined" ? window.innerWidth - anchorX - 150 : 50;

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
          content: "Sent — response in terminal.",
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
      {/* Backdrop */}
      <div
        onClick={() => setExpanded(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 41,
          background: "rgba(0,0,0,0.03)",
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "opacity 0.2s ease",
        }}
      />

      {/* Arc session bubbles */}
      {linkedSessionIds.map((sid, i) => {
        const total = linkedSessionIds.length;
        const angle = total === 1 ? -90 : startAngle + (i / Math.max(total - 1, 1)) * totalArc;
        const rad = (angle * Math.PI) / 180;
        const bx = anchorX + arcRadius * Math.cos(rad) - 18;
        const by = anchorY + arcRadius * Math.sin(rad) - 18;
        const color = getSessionColor(sid);
        const session = sessions.find((s) => s.id === sid);
        const delay = i * 0.05;

        return (
          <div
            key={sid}
            style={{
              position: "fixed", left: bx, top: by,
              width: 36, height: 36, zIndex: 43,
              borderRadius: "50%",
              border: `2px solid ${color}`,
              background: "var(--color-bg-card, #fff)",
              boxShadow: `0 2px 8px rgba(0,0,0,0.1), 0 0 0 2px ${color}20`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 0,
              transform: open ? "scale(1)" : "scale(0)",
              opacity: open ? 1 : 0,
              transition: reducedMotion ? "none" : `all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
            }}
            title={session?.projectName ?? sid}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 6, fontWeight: 600, color: "var(--color-text-secondary, #555)", maxWidth: 28, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(session?.projectName ?? sid).slice(0, 4)}
            </span>
          </div>
        );
      })}

      {/* Chat card — speech bubble above the arc */}
      <div
        style={{
          position: "fixed",
          right: Math.max(8, cardRight),
          bottom: Math.max(8, cardBottom),
          width: 300,
          height: 320,
          zIndex: 42,
          borderRadius: 16,
          background: "var(--color-bg-card, #fff)",
          border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transform: open ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)",
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.08s",
        }}
      >
        {/* Tail pointer */}
        <div style={{
          position: "absolute", bottom: -8, right: 28,
          width: 16, height: 16,
          background: "var(--color-bg-card, #fff)",
          border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
          borderTop: "none", borderLeft: "none",
          transform: "rotate(45deg)",
          boxShadow: "4px 4px 8px rgba(0,0,0,0.04)",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--color-border, rgba(0,0,0,0.06))", flexShrink: 0 }}>
          {linkedSessionIds.map((sid) => (
            <div key={sid} style={{ width: 8, height: 8, borderRadius: "50%", background: getSessionColor(sid) }} />
          ))}
          <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary, #555)" }}>
            {mode === "debate" ? "⚖️ Debate" : "Shared Context"}
          </span>
          <button onClick={() => setExpanded(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-text-muted, #999)", display: "flex" }} aria-label="Close">
            <X size={13} weight="bold" />
          </button>
        </div>

        {/* Chat area */}
        <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {sharedMessages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6 }}>
              <span style={{ fontSize: 22, opacity: 0.2 }}>✦</span>
              <span style={{ fontSize: 11, color: "var(--color-text-muted, #999)", textAlign: "center" }}>
                Type to broadcast to all linked sessions
              </span>
            </div>
          )}
          {sharedMessages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: 1 }}>
              <span style={{ fontSize: 9, color: "var(--color-text-muted, #999)" }}>
                {msg.sessionName} · {formatTime(msg.timestamp)}
              </span>
              <div style={{
                fontSize: 12, lineHeight: 1.4, padding: "4px 8px", borderRadius: 8, maxWidth: "85%",
                background: msg.role === "user" ? "#4285F4" : "var(--color-bg-elevated, #f0f0f0)",
                color: msg.role === "user" ? "#fff" : "var(--color-text-primary, #333)",
                borderLeft: msg.role === "assistant" ? `3px solid ${msg.sessionColor}` : undefined,
              }}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 6, padding: "6px 8px", borderTop: "1px solid var(--color-border, rgba(0,0,0,0.06))", flexShrink: 0 }}>
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Broadcast message…" rows={1}
            style={{ flex: 1, resize: "none", border: "1px solid var(--color-border, rgba(0,0,0,0.08))", borderRadius: 8, padding: "5px 8px", fontSize: 12, outline: "none", background: "var(--color-bg-elevated, #f8f8f8)", color: "var(--color-text-primary, #333)", minHeight: 20, maxHeight: 60 }}
          />
          <button
            onClick={() => void handleSend()} disabled={sending || !input.trim()}
            style={{ background: "#4285F4", color: "#fff", border: "none", borderRadius: 8, padding: "0 10px", cursor: input.trim() ? "pointer" : "default", opacity: input.trim() ? 1 : 0.4, display: "flex", alignItems: "center" }}
            aria-label="Send"
          >
            <PaperPlaneTilt size={13} weight="fill" />
          </button>
        </div>
      </div>
    </>
  );
}
