"use client";
import { useState, useEffect } from "react";
import { X, LinkSimple } from "@phosphor-icons/react";
import { useRingStore } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { getFanDirection } from "./fan-layout";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
const FAN_RADIUS = 320;
const FAN_SPREAD_DEG = 140;
const MAX_SESSIONS = 4;
const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return GOOGLE_COLORS[Math.abs(hash) % GOOGLE_COLORS.length]!;
}

function computeFanLayout(dir: string, anchorX: number, anchorY: number) {
  const baseAngle = dir === "up-left" ? -135 : dir === "up-right" ? -45 : dir === "down-left" ? 135 : 45;
  const px = (dir === "up-left" || dir === "down-left") ? 1 : 0;
  const py = (dir === "up-left" || dir === "up-right") ? 1 : 0;

  const left = anchorX - FAN_RADIUS * px;
  const top = anchorY - FAN_RADIUS * py;

  const halfSpread = FAN_SPREAD_DEG / 2;
  const startAngle = baseAngle - halfSpread;
  const endAngle = baseAngle + halfSpread;
  const points: string[] = [`${px * 100}% ${py * 100}%`];
  for (let i = 0; i <= 28; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / 28);
    const rad = (angle * Math.PI) / 180;
    points.push(`${(px * 100 + 100 * Math.cos(rad)).toFixed(1)}% ${(py * 100 + 100 * Math.sin(rad)).toFixed(1)}%`);
  }

  return { left, top, pivotX: `${px * 100}%`, pivotY: `${py * 100}%`, baseAngle, px, py, clipPath: `polygon(${points.join(", ")})` };
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
  const fan = computeFanLayout(dir, anchorX, anchorY);

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

  // Form position inside the fan
  const formRad = (fan.baseAngle * Math.PI) / 180;
  const formX = fan.px * FAN_RADIUS + Math.cos(formRad) * FAN_RADIUS * 0.32 - 100;
  const formY = fan.py * FAN_RADIUS + Math.sin(formRad) * FAN_RADIUS * 0.32 - 65;

  return (
    <div
      style={{
        position: "fixed",
        left: fan.left,
        top: fan.top,
        width: FAN_RADIUS,
        height: FAN_RADIUS,
        zIndex: 41,
        clipPath: fan.clipPath,
        background: "var(--color-bg-card, rgba(245, 243, 239, 0.96))",
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
        transform: open ? "scale(1)" : "scale(0)",
        transformOrigin: `${fan.pivotX} ${fan.pivotY}`,
        opacity: open ? 1 : 0,
        transition: reducedMotion ? "none" : "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        pointerEvents: open ? "auto" : "none",
        overflow: "hidden",
      }}
    >
      {/* Session buttons along the arc */}
      {activeSessions.map((session, i) => {
        const total = activeSessions.length;
        const angle = fan.baseAngle - FAN_SPREAD_DEG / 2 + ((i + 0.5) / total) * FAN_SPREAD_DEG;
        const aRad = (angle * Math.PI) / 180;
        const r = FAN_RADIUS * 0.65;
        const lx = fan.px * FAN_RADIUS + r * Math.cos(aRad);
        const ly = fan.py * FAN_RADIUS + r * Math.sin(aRad);
        const color = getSessionColor(session.id);
        const isSelected = selected.has(session.id);

        return (
          <button
            key={session.id}
            onClick={() => toggleSession(session.id)}
            style={{
              position: "absolute", left: lx - 32, top: ly - 14, width: 64,
              padding: "3px 0", textAlign: "center",
              background: isSelected ? `${color}15` : "transparent",
              border: isSelected ? `1.5px solid ${color}` : "1.5px solid transparent",
              borderRadius: 8, cursor: "pointer",
              opacity: open ? 1 : 0,
              transition: reducedMotion ? "none" : `opacity 0.3s ease ${0.2 + i * 0.08}s`,
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, margin: "0 auto 2px" }} />
            <div style={{ fontSize: 8, fontWeight: isSelected ? 700 : 500, color: isSelected ? color : "var(--color-text-secondary, #666)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session.projectName ?? session.id.slice(0, 6)}
            </div>
          </button>
        );
      })}

      {/* Form: topic + action buttons — directly on fan surface */}
      <div
        style={{
          position: "absolute",
          left: formX,
          top: formY,
          width: 200,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          padding: 8,
          opacity: open ? 1 : 0,
          transition: reducedMotion ? "none" : "opacity 0.3s ease 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <LinkSimple size={12} weight="bold" style={{ color: "#4285F4" }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-primary, #333)", flex: 1 }}>Link Sessions</span>
          <button onClick={() => setSelecting(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "#999", display: "flex" }} aria-label="Close">
            <X size={10} weight="bold" />
          </button>
        </div>

        <input
          type="text" value={topic} onChange={(e) => setTopicLocal(e.target.value)}
          placeholder="Topic (optional)"
          style={{ padding: "3px 6px", fontSize: 9, borderRadius: 6, border: "1px solid var(--color-border, rgba(0,0,0,0.06))", outline: "none", background: "var(--color-bg-base, rgba(255,255,255,0.6))", color: "var(--color-text-primary, #333)" }}
        />

        {activeSessions.length === 0 && (
          <p style={{ fontSize: 9, color: "#999", textAlign: "center", padding: 4 }}>No active sessions</p>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 8, color: "#999" }}>{selected.size}/{MAX_SESSIONS}</span>
          <div style={{ display: "flex", gap: 3 }}>
            <button onClick={() => setSelecting(false)} style={{ padding: "2px 8px", fontSize: 9, borderRadius: 5, border: "1px solid var(--color-border, rgba(0,0,0,0.08))", background: "transparent", cursor: "pointer", color: "#666" }}>
              Cancel
            </button>
            <button
              onClick={handleLink} disabled={selected.size === 0}
              style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, borderRadius: 5, border: "none", background: selected.size > 0 ? "#4285F4" : "#ccc", color: "#fff", cursor: selected.size > 0 ? "pointer" : "default" }}
            >
              Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
