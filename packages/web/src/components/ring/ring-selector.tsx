"use client";
import { useState, useEffect } from "react";
import { X, LinkSimple } from "@phosphor-icons/react";
import { useRingStore } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
const MAX_SESSIONS = 4;
const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return GOOGLE_COLORS[Math.abs(hash) % GOOGLE_COLORS.length]!;
}

interface RingSelectorProps {
  anchorX: number;
  anchorY: number;
}

export function RingSelector({ anchorX, anchorY }: RingSelectorProps) {
  const sessionsMap = useSessionStore((s) => s.sessions);
  const sessions = Object.values(sessionsMap);
  const linkSession = useRingStore((s) => s.linkSession);
  const setSelecting = useRingStore((s) => s.setSelecting);
  const setExpanded = useRingStore((s) => s.setExpanded);
  const setTopic = useRingStore((s) => s.setTopic);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topic, setTopicLocal] = useState("");
  const [open, setOpen] = useState(false);

  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const activeSessions = sessions.filter((s) => ACTIVE_STATUSES.has(s.status));

  useEffect(() => {
    if (reducedMotion) { setOpen(true); return; }
    requestAnimationFrame(() => setOpen(true));
  }, [reducedMotion]);

  function toggleSession(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SESSIONS) next.add(id);
      return next;
    });
  }

  function handleLink() {
    for (const id of selected) linkSession(id);
    setTopic(topic);
    setSelecting(false);
    if (selected.size > 0) setExpanded(true);
  }

  // Arc layout: sessions arranged in a curve above the ring
  const arcRadius = 90;
  const totalArc = Math.min(activeSessions.length * 40, 160); // degrees
  const startAngle = -90 - totalArc / 2; // centered above

  // Card position: above the arc
  const cardBottom = typeof window !== "undefined" ? window.innerHeight - anchorY + 30 + arcRadius : 200;
  const cardRight = typeof window !== "undefined" ? window.innerWidth - anchorX - 130 : 50;

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        onClick={() => setSelecting(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 41,
          background: "rgba(0,0,0,0.05)",
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "opacity 0.2s ease",
        }}
      />

      {/* Arc session bubbles */}
      {activeSessions.map((session, i) => {
        const total = activeSessions.length;
        const angle = startAngle + (i / Math.max(total - 1, 1)) * totalArc;
        const rad = (angle * Math.PI) / 180;
        const bx = anchorX + arcRadius * Math.cos(rad) - 22;
        const by = anchorY + arcRadius * Math.sin(rad) - 22;
        const color = getSessionColor(session.id);
        const isSelected = selected.has(session.id);
        const delay = i * 0.05;

        return (
          <button
            key={session.id}
            onClick={() => toggleSession(session.id)}
            style={{
              position: "fixed",
              left: bx,
              top: by,
              width: 44,
              height: 44,
              zIndex: 43,
              borderRadius: "50%",
              border: isSelected ? `2.5px solid ${color}` : "2px solid var(--color-border, rgba(0,0,0,0.1))",
              background: isSelected ? `${color}15` : "var(--color-bg-card, #fff)",
              boxShadow: isSelected ? `0 0 12px ${color}40` : "0 2px 8px rgba(0,0,0,0.1)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              padding: 0,
              transform: open ? "scale(1)" : "scale(0)",
              opacity: open ? 1 : 0,
              transition: reducedMotion ? "none" : `all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
            }}
            title={session.projectName ?? session.id}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 7, fontWeight: 600, color: "var(--color-text-secondary, #555)", maxWidth: 36, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(session.projectName ?? session.id).slice(0, 5)}
            </span>
          </button>
        );
      })}

      {/* Card panel — above the arc, speech-bubble style */}
      <div
        style={{
          position: "fixed",
          right: Math.max(8, cardRight),
          bottom: Math.max(8, cardBottom),
          width: 260,
          zIndex: 42,
          borderRadius: 16,
          background: "var(--color-bg-card, #fff)",
          border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          transform: open ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)",
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s",
        }}
      >
        {/* Tail pointer toward ring */}
        <div style={{
          position: "absolute",
          bottom: -8,
          right: 24,
          width: 16,
          height: 16,
          background: "var(--color-bg-card, #fff)",
          border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
          borderTop: "none",
          borderLeft: "none",
          transform: "rotate(45deg)",
          boxShadow: "4px 4px 8px rgba(0,0,0,0.04)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LinkSimple size={14} weight="bold" style={{ color: "#4285F4" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary, #333)", flex: 1 }}>Link Sessions</span>
          <button onClick={() => setSelecting(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#999", display: "flex" }} aria-label="Close">
            <X size={12} weight="bold" />
          </button>
        </div>

        <input
          type="text" value={topic} onChange={(e) => setTopicLocal(e.target.value)}
          placeholder="Shared topic (optional)"
          style={{ padding: "6px 10px", fontSize: 11, borderRadius: 8, border: "1px solid var(--color-border, rgba(0,0,0,0.08))", outline: "none", background: "var(--color-bg-elevated, #f8f8f8)", color: "var(--color-text-primary, #333)" }}
        />

        {activeSessions.length === 0 && (
          <p style={{ fontSize: 11, color: "#999", textAlign: "center", padding: 8 }}>No active sessions</p>
        )}

        {activeSessions.length > 0 && (
          <p style={{ fontSize: 9, color: "var(--color-text-muted, #999)" }}>
            Click the bubbles below to select sessions
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#999" }}>{selected.size}/{MAX_SESSIONS} selected</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setSelecting(false)} style={{ padding: "4px 12px", fontSize: 11, borderRadius: 8, border: "1px solid var(--color-border, rgba(0,0,0,0.1))", background: "transparent", cursor: "pointer", color: "#666" }}>
              Cancel
            </button>
            <button
              onClick={handleLink} disabled={selected.size === 0}
              style={{ padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 8, border: "none", background: selected.size > 0 ? "#4285F4" : "#ccc", color: "#fff", cursor: selected.size > 0 ? "pointer" : "default" }}
            >
              Link
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
