"use client";
import { useState, useEffect } from "react";
import { X, LinkSimple } from "@phosphor-icons/react";
import { useRingStore } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { getFanDirection, getBaseAngle } from "./fan-layout";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
const SELECTOR_SIZE = 340;
const FAN_SPREAD_DEG = 150;
const MAX_SESSIONS = 4;
const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return GOOGLE_COLORS[Math.abs(hash) % GOOGLE_COLORS.length]!;
}

function fanClipPath(baseAngle: number): string {
  const halfSpread = FAN_SPREAD_DEG / 2;
  const startAngle = baseAngle - halfSpread;
  const endAngle = baseAngle + halfSpread;
  const points: string[] = ["50% 50%"];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const rad = (angle * Math.PI) / 180;
    points.push(`${(50 + 50 * Math.cos(rad)).toFixed(1)}% ${(50 + 50 * Math.sin(rad)).toFixed(1)}%`);
  }
  return `polygon(${points.join(", ")})`;
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

  const dir = getFanDirection(
    anchorX, anchorY,
    typeof window !== "undefined" ? window.innerWidth : 1920,
    typeof window !== "undefined" ? window.innerHeight : 1080,
  );
  const baseAngle = getBaseAngle(dir);
  const clipPath = fanClipPath(baseAngle);

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

  const fanLeft = anchorX - SELECTOR_SIZE / 2;
  const fanTop = anchorY - SELECTOR_SIZE / 2;

  // Card position: offset from pivot
  const rad = (baseAngle * Math.PI) / 180;
  const cardX = anchorX + Math.cos(rad) * (SELECTOR_SIZE * 0.22) - 115;
  const cardY = anchorY + Math.sin(rad) * (SELECTOR_SIZE * 0.22) - 75;

  return (
    <>
      {/* Fan-shaped background */}
      <div
        style={{
          position: "fixed",
          left: fanLeft,
          top: fanTop,
          width: SELECTOR_SIZE,
          height: SELECTOR_SIZE,
          zIndex: 41,
          clipPath,
          background: "var(--color-bg-card, rgba(245, 243, 239, 0.95))",
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          transform: open ? "scale(1)" : "scale(0)",
          transformOrigin: "50% 50%",
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Session options arranged along the arc */}
        {activeSessions.map((session, i) => {
          const total = activeSessions.length;
          const angle = baseAngle - FAN_SPREAD_DEG / 2 + ((i + 0.5) / total) * FAN_SPREAD_DEG;
          const aRad = (angle * Math.PI) / 180;
          const labelR = SELECTOR_SIZE * 0.38;
          const lx = SELECTOR_SIZE / 2 + labelR * Math.cos(aRad);
          const ly = SELECTOR_SIZE / 2 + labelR * Math.sin(aRad);
          const color = getSessionColor(session.id);
          const isSelected = selected.has(session.id);

          return (
            <button
              key={session.id}
              onClick={() => toggleSession(session.id)}
              style={{
                position: "absolute",
                left: lx - 35,
                top: ly - 16,
                width: 70,
                padding: "4px 0",
                textAlign: "center",
                background: isSelected ? `${color}15` : "transparent",
                border: isSelected ? `1.5px solid ${color}` : "1.5px solid transparent",
                borderRadius: 8,
                cursor: "pointer",
                opacity: open ? 1 : 0,
                transition: reducedMotion ? "none" : `opacity 0.3s ease ${0.2 + i * 0.08}s`,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, margin: "0 auto 2px" }} />
              <div style={{ fontSize: 9, fontWeight: isSelected ? 700 : 500, color: isSelected ? color : "var(--color-text-secondary, #666)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {session.projectName ?? session.id.slice(0, 6)}
              </div>
              <div style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--color-text-muted, #999)" }}>
                {session.model?.split("-").pop() ?? ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Compact card: topic + buttons */}
      <div
        style={{
          position: "fixed",
          left: Math.max(8, cardX),
          top: Math.max(8, cardY),
          width: 230,
          zIndex: 42,
          borderRadius: 12,
          background: "var(--color-bg-elevated, rgba(255,255,255,0.98))",
          border: "1px solid var(--color-border, rgba(0,0,0,0.06))",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.85)",
          transition: reducedMotion ? "none" : "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <LinkSimple size={13} weight="bold" style={{ color: "#4285F4" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary, #333)", flex: 1 }}>Link Sessions</span>
          <button onClick={() => setSelecting(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#999", display: "flex" }} aria-label="Close">
            <X size={11} weight="bold" />
          </button>
        </div>

        <input
          type="text"
          value={topic}
          onChange={(e) => setTopicLocal(e.target.value)}
          placeholder="Shared topic (optional)"
          style={{ padding: "4px 7px", fontSize: 10, borderRadius: 7, border: "1px solid var(--color-border, rgba(0,0,0,0.08))", outline: "none", background: "var(--color-bg-base, rgba(255,255,255,0.8))", color: "var(--color-text-primary, #333)" }}
        />

        {activeSessions.length === 0 && (
          <p style={{ fontSize: 10, color: "#999", textAlign: "center", padding: 6 }}>No active sessions</p>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <span style={{ fontSize: 9, color: "#999" }}>{selected.size}/{MAX_SESSIONS}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setSelecting(false)} style={{ padding: "3px 10px", fontSize: 10, borderRadius: 6, border: "1px solid var(--color-border, rgba(0,0,0,0.1))", background: "transparent", cursor: "pointer", color: "#666" }}>
              Cancel
            </button>
            <button
              onClick={handleLink}
              disabled={selected.size === 0}
              style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6, border: "none", background: selected.size > 0 ? "#4285F4" : "#ccc", color: "#fff", cursor: selected.size > 0 ? "pointer" : "default" }}
            >
              Link
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
