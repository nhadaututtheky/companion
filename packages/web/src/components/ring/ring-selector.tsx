"use client";
import { useState, useEffect } from "react";
import { X, LinkSimple } from "@phosphor-icons/react";
import { useRingStore } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import {
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

interface RingSelectorProps {
  anchorX: number;
  anchorY: number;
}

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);
const MINI_RADIUS = 180;
const MAX_SESSIONS = 4;

export function RingSelector({ anchorX, anchorY }: RingSelectorProps) {
  const sessionsMap = useSessionStore((s) => s.sessions);
  const sessions = Object.values(sessionsMap);
  const linkSession = useRingStore((s) => s.linkSession);
  const setSelecting = useRingStore((s) => s.setSelecting);
  const setExpanded = useRingStore((s) => s.setExpanded);
  const setTopic = useRingStore((s) => s.setTopic);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topic, setTopicLocal] = useState("");
  const [animating, setAnimating] = useState(true);

  const activeSessions = sessions.filter((s) => ACTIVE_STATUSES.has(s.status));

  // Fan direction
  const dir = getFanDirection(
    anchorX,
    anchorY,
    typeof window !== "undefined" ? window.innerWidth : 1920,
    typeof window !== "undefined" ? window.innerHeight : 1080,
  );

  const blades = getBladeAngles(activeSessions.length, dir);
  const contentPos = getContentCenter(dir, MINI_RADIUS * 0.4);

  useEffect(() => {
    const timer = setTimeout(() => setAnimating(false), 400);
    return () => clearTimeout(timer);
  }, []);

  function toggleSession(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SESSIONS) {
        next.add(id);
      }
      return next;
    });
  }

  function handleLink() {
    for (const id of selected) {
      linkSession(id);
    }
    setTopic(topic);
    setSelecting(false);
    if (selected.size > 0) {
      setExpanded(true);
    }
  }

  const svgSize = MINI_RADIUS * 2 + 40;
  const center = svgSize / 2;
  const svgLeft = anchorX - center;
  const svgTop = anchorY - center;

  const overlayLeft = anchorX + contentPos.x - 120;
  const overlayTop = anchorY + contentPos.y - 80;

  return (
    <>
      {/* SVG fan blades for session selection */}
      <svg
        width={svgSize}
        height={svgSize}
        style={{
          position: "fixed",
          left: svgLeft,
          top: svgTop,
          zIndex: 41,
          pointerEvents: "none",
          overflow: "visible",
        }}
        aria-hidden="true"
      >
        <g transform={`translate(${center}, ${center})`}>
          {blades.map((blade, i) => {
            const session = activeSessions[i];
            if (!session) return null;
            const sid = session.id;
            const color = getSessionColor(sid);
            const isSelected = selected.has(sid);
            const labelPos = bladeLabelPosition(blade.midAngle, MINI_RADIUS * 0.65);

            const delay = i * 0.06;

            return (
              <g
                key={sid}
                style={{
                  opacity: animating ? 0 : 1,
                  transform: animating ? "rotate(-15deg)" : "rotate(0deg)",
                  transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
                }}
              >
                <path
                  d={bladePath(blade.startAngle, blade.endAngle, 30, MINI_RADIUS)}
                  fill={isSelected ? `${color}20` : "rgba(245, 243, 239, 0.9)"}
                  stroke={isSelected ? color : "rgba(0,0,0,0.1)"}
                  strokeWidth={isSelected ? 2 : 1}
                  style={{ pointerEvents: "auto", cursor: "pointer" }}
                  onClick={() => toggleSession(sid)}
                />

                {/* Session label */}
                <text
                  x={labelPos.x}
                  y={labelPos.y - 6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10}
                  fontWeight={isSelected ? 700 : 500}
                  fill={isSelected ? color : "#666"}
                  style={{ pointerEvents: "none" }}
                >
                  {session.projectName ?? sid.slice(0, 8)}
                </text>
                <text
                  x={labelPos.x}
                  y={labelPos.y + 8}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  fill="#999"
                  style={{ pointerEvents: "none" }}
                >
                  {session.model?.split("-").pop() ?? ""}
                </text>

                {/* Selection checkmark */}
                {isSelected && (
                  <circle
                    cx={labelPos.x + 30}
                    cy={labelPos.y - 6}
                    r={5}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Center overlay — topic + action buttons */}
      <div
        style={{
          position: "fixed",
          left: Math.max(8, overlayLeft),
          top: Math.max(8, overlayTop),
          width: 240,
          zIndex: 42,
          borderRadius: 14,
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          opacity: animating ? 0 : 1,
          transform: animating ? "scale(0.85)" : "scale(1)",
          transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LinkSimple size={14} weight="bold" style={{ color: "#4285F4" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary, #333)", flex: 1 }}>
            Link Sessions
          </span>
          <button
            onClick={() => setSelecting(false)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#999", display: "flex" }}
            aria-label="Close"
          >
            <X size={12} weight="bold" />
          </button>
        </div>

        <input
          type="text"
          value={topic}
          onChange={(e) => setTopicLocal(e.target.value)}
          placeholder="Shared topic (optional)"
          style={{
            padding: "5px 8px",
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.08)",
            outline: "none",
            background: "rgba(255,255,255,0.8)",
            color: "var(--color-text-primary, #333)",
          }}
        />

        {activeSessions.length === 0 && (
          <p style={{ fontSize: 11, color: "#999", textAlign: "center", padding: 8 }}>
            No active sessions
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#999" }}>
            {selected.size}/{MAX_SESSIONS} selected
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setSelecting(false)}
              style={{
                padding: "4px 12px",
                fontSize: 11,
                borderRadius: 6,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "transparent",
                cursor: "pointer",
                color: "#666",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleLink}
              disabled={selected.size === 0}
              style={{
                padding: "4px 12px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                background: selected.size > 0 ? "#4285F4" : "#ccc",
                color: "#fff",
                cursor: selected.size > 0 ? "pointer" : "default",
              }}
            >
              Link
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
