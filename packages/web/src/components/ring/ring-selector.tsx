"use client";
import { useState, useEffect } from "react";
import { Z } from "@/lib/z-index";
import { X, LinkSimple } from "@phosphor-icons/react";
import { useRingStore } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

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
  const [hoveredBubble, setHoveredBubble] = useState<number>(-1);

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const activeSessions = sessions.filter((s) => ACTIVE_STATUSES.has(s.status));

  useEffect(() => {
    if (reducedMotion) {
      setOpen(true); // eslint-disable-line react-hooks/set-state-in-effect -- reduced-motion: open immediately on mount
      return;
    }
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

  // Dock layout
  const bubbleSize = 44;
  const bubbleGap = 8;
  const dockWidth = activeSessions.length * (bubbleSize + bubbleGap) - bubbleGap;

  // Card: right edge aligns near Ring, sits above bubbles
  const cardLeft = Math.max(8, anchorX - 254);
  const cardTop = Math.max(8, anchorY - bubbleSize / 2 - 200);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setSelecting(false)}
        style={{ position: "fixed", inset: 0, zIndex: Z.ringBackdrop, background: "rgba(0,0,0,0.03)" }}
      />

      {/* Chrome bridge connecting bubbles to ring */}
      {activeSessions.length > 0 && (
        <svg
          style={{
            position: "fixed",
            left: anchorX - 26 - 12 - dockWidth - 4,
            top: anchorY - 2,
            width: dockWidth + 16,
            height: 4,
            zIndex: Z.ringConnector,
            opacity: open ? 0.5 : 0,
            transition: reducedMotion ? "none" : "opacity 0.3s ease 0.15s",
          }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="chrome-sel" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EA4335" />
              <stop offset="33%" stopColor="#FBBC04" />
              <stop offset="66%" stopColor="#34A853" />
              <stop offset="100%" stopColor="#4285F4" />
            </linearGradient>
          </defs>
          <rect x="0" y="2" width="100%" height="4" rx="2" fill="url(#chrome-sel)" />
        </svg>
      )}

      {/* Dock: session bubbles to the LEFT — macOS magnification */}
      {activeSessions.map((session, i) => {
        const color = getSessionColor(session.id);
        const isSelected = selected.has(session.id);
        const isHovered = hoveredBubble === i;
        const dist = hoveredBubble === -1 ? 99 : Math.abs(hoveredBubble - i);
        const scale = isHovered ? 1.35 : dist === 1 ? 1.15 : 1;
        const size = bubbleSize * scale;
        const delay = i * 0.05;

        // Position bubbles to the LEFT of Ring with gap. anchorX = ring center, ring radius ~26px
        const ringEdgeLeft = anchorX - 26 - 12; // ring left edge - gap
        const baseX = ringEdgeLeft - (activeSessions.length - i) * (bubbleSize + bubbleGap) + i * 0; // rightmost bubble closest to ring
        const baseY = anchorY - size / 2; // vertically centered with ring

        return (
          <button
            key={session.id}
            onClick={() => toggleSession(session.id)}
            onMouseEnter={() => setHoveredBubble(i)}
            onMouseLeave={() => setHoveredBubble(-1)}
            style={{
              position: "fixed",
              left: baseX,
              top: baseY,
              width: size,
              height: size,
              zIndex: Z.ringWindow,
              borderRadius: "50%",
              border: isSelected ? `3px solid ${color}` : "2px solid transparent",
              background: isSelected ? `${color}20` : "transparent",
              boxShadow: isHovered
                ? `0 4px 16px ${color}40`
                : isSelected
                  ? `0 0 12px ${color}30`
                  : "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
              gap: 1,
              padding: 0,
              transform: open ? "scale(1)" : "scale(0)",
              opacity: open ? 1 : 0,
              transition: reducedMotion
                ? "none"
                : `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
            }}
            title={session.projectName ?? session.id}
          >
            <div
              style={{
                position: "absolute",
                inset: -4,
                opacity: 0.85,
                pointerEvents: "none",
              }}
            >
              <DotLottieReact
                src="/mascots/pulse.lottie"
                loop
                autoplay
                style={{ width: "100%", height: "100%" }}
              />
            </div>
            <div
              style={{ width: 7, height: 7, borderRadius: "50%", background: color, zIndex: Z.base }}
            />
            <span
              style={{
                fontSize: isHovered ? 8 : 7,
                fontWeight: isSelected ? 700 : 500,
                color: isSelected ? color : "var(--color-text-secondary, #555)",
                maxWidth: size - 10,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                zIndex: Z.base,
              }}
            >
              {(session.projectName ?? session.id).slice(0, 6)}
            </span>
            {/* Selection checkmark */}
            {isSelected && (
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: color,
                  border: "1.5px solid #fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                ✓
              </div>
            )}
          </button>
        );
      })}

      {/* Card above dock */}
      <div
        style={{
          position: "fixed",
          left: cardLeft,
          top: cardTop,
          width: 280,
          zIndex: Z.ringConnector,
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LinkSimple size={14} weight="bold" style={{ color: "#4285F4" }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-primary, #333)",
              flex: 1,
            }}
          >
            Link Sessions
          </span>
          <button
            onClick={() => setSelecting(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              color: "#999",
              display: "flex",
            }}
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
            padding: "6px 10px",
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
            outline: "none",
            background: "var(--color-bg-elevated, #f8f8f8)",
            color: "var(--color-text-primary, #333)",
          }}
        />

        {activeSessions.length === 0 && (
          <p style={{ fontSize: 11, color: "#999", textAlign: "center", padding: 8 }}>
            No active sessions — start one first
          </p>
        )}

        {activeSessions.length > 0 && (
          <p style={{ fontSize: 10, color: "var(--color-text-muted, #999)" }}>
            Click bubbles below to select sessions ({selected.size}/{MAX_SESSIONS})
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          <button
            onClick={() => setSelecting(false)}
            style={{
              padding: "5px 14px",
              fontSize: 11,
              borderRadius: 8,
              border: "1px solid var(--color-border, rgba(0,0,0,0.1))",
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
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: selected.size > 0 ? "#4285F4" : "#ccc",
              color: "#fff",
              cursor: selected.size > 0 ? "pointer" : "default",
            }}
          >
            Link {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </>
  );
}
