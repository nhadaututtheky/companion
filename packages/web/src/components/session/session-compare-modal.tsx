"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowsLeftRight } from "@phosphor-icons/react";
import { useSession } from "@/hooks/use-session";
import type { Message } from "./message-feed";
import { MarkdownMessage } from "@/components/chat/markdown-message";

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionData {
  id: string;
  projectName: string;
  model: string;
  status: string;
  state?: {
    total_cost_usd?: number;
    num_turns?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
}

interface SessionCompareModalProps {
  sessions: Record<string, SessionData>;
  initialLeft?: string;
  initialRight?: string;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtCost = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);

const STATUS_COLORS: Record<string, string> = {
  starting: "#FBBC04",
  idle: "#34A853",
  running: "#4285F4",
  busy: "#4285F4",
  waiting: "#FBBC04",
  ended: "#9AA0A6",
  error: "#EA4335",
};

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, { bg: string; fg: string; label: string }> = {
    user: { bg: "#4285F420", fg: "#4285F4", label: "You" },
    assistant: { bg: "#34A85320", fg: "#34A853", label: "Claude" },
    system: { bg: "var(--color-bg-elevated)", fg: "var(--color-text-muted)", label: "System" },
    tool: { bg: "#FBBC0420", fg: "#FBBC04", label: "Tool" },
  };
  const s = styles[role] ?? styles.system!;
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold flex-shrink-0"
      style={{ background: s.bg, color: s.fg, fontSize: 10 }}
    >
      {s.label}
    </span>
  );
}

// ── Compare message card ──────────────────────────────────────────────────────

function CompareMessage({ msg }: { msg: Message }) {
  const [collapsed, setCollapsed] = useState(msg.role === "tool");

  const isLong = msg.content.length > 600;
  const displayContent = collapsed && isLong
    ? msg.content.slice(0, 400) + "…"
    : msg.content;

  return (
    <div
      className="px-3 py-2.5 rounded-lg"
      style={{
        background: msg.role === "user" ? "var(--color-bg-elevated)" : "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <RoleBadge role={msg.role} />
        <span
          className="text-xs"
          style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {new Date(msg.timestamp).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
        {msg.costUsd !== undefined && msg.costUsd > 0 && (
          <span
            className="ml-auto text-xs"
            style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
          >
            {fmtCost(msg.costUsd)}
          </span>
        )}
      </div>
      <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {msg.role === "assistant" || msg.role === "user" ? (
          <MarkdownMessage content={displayContent} />
        ) : (
          <pre
            className="text-xs overflow-x-auto"
            style={{
              fontFamily: "var(--font-mono)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {displayContent}
          </pre>
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="mt-1 text-xs cursor-pointer"
          style={{ color: "var(--color-accent)" }}
        >
          {collapsed ? "Show more" : "Show less"}
        </button>
      )}
    </div>
  );
}

// ── Session column ────────────────────────────────────────────────────────────

interface SessionColumnProps {
  sessionId: string | null;
  sessions: Record<string, SessionData>;
  side: "left" | "right";
  onSelect: (id: string) => void;
}

function SessionColumn({ sessionId, sessions, side, onSelect }: SessionColumnProps) {
  const { messages } = useSession(sessionId ?? "");
  const feedRef = useRef<HTMLDivElement>(null);
  const sessionEntries = Object.values(sessions);
  const session = sessionId ? sessions[sessionId] : null;
  const dotColor = session ? (STATUS_COLORS[session.status] ?? "#9AA0A6") : "#9AA0A6";
  const modelShort = session
    ? session.model.includes("opus")
      ? "Opus"
      : session.model.includes("haiku")
        ? "Haiku"
        : "Sonnet"
    : "";

  // Auto-scroll to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className="flex flex-col flex-1 min-w-0"
      style={{
        borderRight: side === "left" ? "1px solid var(--color-border)" : undefined,
      }}
    >
      {/* Selector header */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-card)" }}
      >
        <label
          htmlFor={`compare-select-${side}`}
          className="text-xs font-semibold flex-shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          {side === "left" ? "Session A" : "Session B"}
        </label>
        <select
          id={`compare-select-${side}`}
          value={sessionId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="flex-1 min-w-0 text-sm rounded-md px-2 py-1 cursor-pointer"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
            outline: "none",
          }}
        >
          <option value="">— Select session —</option>
          {sessionEntries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.projectName || s.id.slice(0, 8)} ({s.status})
            </option>
          ))}
        </select>
      </div>

      {/* Session metadata */}
      {session && (
        <div
          className="flex items-center gap-3 px-4 py-2 flex-shrink-0 flex-wrap"
          style={{
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-bg-elevated)",
          }}
        >
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: dotColor,
              }}
              aria-hidden="true"
            />
            <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>{session.projectName}</span>
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium"
            style={{
              background: "var(--color-bg-card)",
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              border: "1px solid var(--color-border)",
            }}
          >
            {modelShort}
          </span>
          {session.state && (
            <>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {session.state.num_turns ?? 0} turns
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
              >
                {fmtCost(session.state.total_cost_usd ?? 0)}
              </span>
            </>
          )}
          <span
            className="text-xs capitalize"
            style={{ color: dotColor, fontWeight: 600, marginLeft: "auto" }}
          >
            {session.status}
          </span>
        </div>
      )}

      {/* Message feed */}
      {!sessionId ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
          <ArrowsLeftRight size={32} style={{ color: "var(--color-text-muted)", opacity: 0.4 }} aria-hidden="true" />
          <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
            Select a session to compare
          </p>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 px-6">
          <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
            No messages yet
          </p>
        </div>
      ) : (
        <div
          ref={feedRef}
          className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3"
          style={{ scrollbarWidth: "thin" }}
        >
          {messages.map((msg) => (
            <CompareMessage key={msg.id} msg={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal root ────────────────────────────────────────────────────────────────

function SessionCompareModalInner({
  sessions,
  initialLeft,
  initialRight,
  onClose,
}: SessionCompareModalProps) {
  const [leftId, setLeftId] = useState<string | null>(initialLeft ?? null);
  const [rightId, setRightId] = useState<string | null>(initialRight ?? null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Escape key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  const handleLeftSelect = useCallback((id: string) => {
    setLeftId(id || null);
  }, []);

  const handleRightSelect = useCallback((id: string) => {
    setRightId(id || null);
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(4px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Compare sessions"
    >
      {/* Modal container */}
      <div
        className="flex flex-col flex-1 m-4 overflow-hidden rounded-xl"
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div
          className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-card)" }}
        >
          <ArrowsLeftRight size={18} style={{ color: "var(--color-accent)" }} aria-hidden="true" />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Compare Sessions
          </span>
          <span className="text-xs flex-1" style={{ color: "var(--color-text-muted)" }}>
            Side-by-side message history
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close compare modal"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#EA4335"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; }}
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {/* Two-column content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SessionColumn
            sessionId={leftId}
            sessions={sessions}
            side="left"
            onSelect={handleLeftSelect}
          />
          <SessionColumn
            sessionId={rightId}
            sessions={sessions}
            side="right"
            onSelect={handleRightSelect}
          />
        </div>
      </div>
    </div>
  );
}

export function SessionCompareModal(props: SessionCompareModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- SSR portal guard
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;
  return createPortal(<SessionCompareModalInner {...props} />, document.body);
}
