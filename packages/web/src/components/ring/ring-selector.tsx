"use client";
import { useState, useEffect, useRef } from "react";
import { X, LinkSimple } from "@phosphor-icons/react";
import { useRingStore } from "@/lib/stores/ring-store";
import { useSessionStore } from "@/lib/stores/session-store";

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

export function RingSelector({ anchorX, anchorY }: RingSelectorProps) {
  const linkedSessionIds = useRingStore((s) => s.linkedSessionIds);
  const topic = useRingStore((s) => s.topic);
  const setTopic = useRingStore((s) => s.setTopic);
  const linkSession = useRingStore((s) => s.linkSession);
  const unlinkSession = useRingStore((s) => s.unlinkSession);
  const setSelecting = useRingStore((s) => s.setSelecting);
  const sessions = useSessionStore((s) => s.sessions);
  const closedIds = useSessionStore((s) => s.closedIds);

  const [selected, setSelected] = useState<Set<string>>(new Set(linkedSessionIds));
  const ref = useRef<HTMLDivElement>(null);

  // Active sessions (not closed)
  const activeSessions = Object.values(sessions).filter(
    (s) => !closedIds.has(s.id) && ["starting", "running", "waiting", "idle", "busy"].includes(s.status),
  );

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleLink = () => {
    // Unlink sessions that were deselected
    for (const id of linkedSessionIds) {
      if (!selected.has(id)) unlinkSession(id);
    }
    // Link newly selected sessions
    for (const id of selected) {
      if (!linkedSessionIds.includes(id)) linkSession(id);
    }
    setSelecting(false);
  };

  const handleCancel = () => {
    setSelecting(false);
  };

  // Position the popup: prefer above/left of the ring, keep on screen
  const cardWidth = 280;
  const cardHeight = 300; // approximate
  const padding = 12;

  let left = anchorX - cardWidth - padding;
  let top = anchorY - cardHeight / 2;

  if (typeof window !== "undefined") {
    if (left < 8) left = anchorX + 60 + padding;
    if (top < 8) top = 8;
    if (top + cardHeight > window.innerHeight - 8) {
      top = window.innerHeight - cardHeight - 8;
    }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Link Sessions"
      style={{
        position: "fixed",
        left,
        top,
        width: cardWidth,
        zIndex: 41,
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: 12,
        boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LinkSimple size={14} weight="bold" style={{ color: "#4285F4" }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              color: "var(--color-text-primary)",
            }}
          >
            Link Sessions
          </span>
        </div>
        <button
          onClick={handleCancel}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Topic input */}
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Shared topic (optional)"
        style={{
          width: "100%",
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          fontSize: 12,
          fontFamily: "var(--font-body)",
          outline: "none",
          boxSizing: "border-box",
        }}
        aria-label="Shared topic"
      />

      {/* Session list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 160,
          overflowY: "auto",
        }}
      >
        {activeSessions.length === 0 && (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            No active sessions
          </p>
        )}
        {activeSessions.map((s) => {
          const color = getSessionColor(s.id);
          const isChecked = selected.has(s.id);
          const isDisabled = !isChecked && selected.size >= 4;

          return (
            <button
              key={s.id}
              onClick={() => handleToggle(s.id)}
              disabled={isDisabled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: isChecked ? color + "60" : "transparent",
                background: isChecked ? color + "10" : "transparent",
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.4 : 1,
                textAlign: "left",
                width: "100%",
              }}
              aria-pressed={isChecked}
              aria-label={`${isChecked ? "Unlink" : "Link"} session ${s.projectName}`}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: `2px solid ${isChecked ? color : "var(--color-border-strong)"}`,
                  background: isChecked ? color : "transparent",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isChecked && (
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              {/* Color dot */}
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              {/* Name */}
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-body)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.projectName}
              </span>
              {/* Model badge */}
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  background: "var(--color-bg-elevated)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                {s.model.split("-").slice(0, 2).join("-")}
              </span>
            </button>
          );
        })}
      </div>

      {selected.size >= 4 && (
        <p style={{ fontSize: 11, color: "#FBBC04", margin: 0 }}>Max 4 sessions per ring</p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleCancel}
          style={{
            flex: 1,
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)",
            fontSize: 12,
            fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleLink}
          disabled={selected.size === 0}
          style={{
            flex: 1,
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
            background: selected.size === 0 ? "var(--color-bg-elevated)" : "#4285F4",
            color: selected.size === 0 ? "var(--color-text-muted)" : "#fff",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            cursor: selected.size === 0 ? "not-allowed" : "pointer",
          }}
        >
          Link {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>
    </div>
  );
}
