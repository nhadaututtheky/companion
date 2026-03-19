"use client";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Terminal,
  Trash,
  Brain,
  Wrench,
  CheckCircle,
  XCircle,
  Warning,
  CurrencyDollar,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";
import { useActivityStore, type ActivityLog, type ActivityLogType } from "@/lib/stores/activity-store";
import { useSessionStore } from "@/lib/stores/session-store";

// ── Constants ──────────────────────────────────────────────────────────────

const LOG_TYPE_COLORS: Record<ActivityLogType, string> = {
  thinking: "#a855f7",
  tool_use: "#4285F4",
  tool_result: "#34A853",
  result: "#34A853",
  error: "#EA4335",
  permission: "#FBBC04",
  cost: "#FBBC04",
};

const LOG_TYPE_LABELS: Record<ActivityLogType, string> = {
  thinking: "THINK",
  tool_use: "TOOL",
  tool_result: "RESULT",
  result: "DONE",
  error: "ERROR",
  permission: "PERM",
  cost: "COST",
};

// ── Log Type Icon ─────────────────────────────────────────────────────────

function LogTypeIcon({ type, size = 12 }: { type: ActivityLogType; size?: number }) {
  const color = LOG_TYPE_COLORS[type];
  const props = { size, color, weight: "bold" as const };
  switch (type) {
    case "thinking":
      return <Brain {...props} />;
    case "tool_use":
      return <Wrench {...props} />;
    case "tool_result":
      return <CheckCircle {...props} />;
    case "result":
      return <CheckCircle {...props} />;
    case "error":
      return <XCircle {...props} />;
    case "permission":
      return <Warning {...props} />;
    case "cost":
      return <CurrencyDollar {...props} />;
  }
}

// ── Format timestamp ──────────────────────────────────────────────────────

function formatTs(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// ── Single Log Line ───────────────────────────────────────────────────────

function LogLine({ log }: { log: ActivityLog }) {
  const color = LOG_TYPE_COLORS[log.type];
  const label = LOG_TYPE_LABELS[log.type];
  return (
    <div
      className="flex items-start gap-2 px-3 py-0.5 hover:bg-white/5 transition-colors"
      style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", fontSize: 12, lineHeight: "1.6" }}
    >
      {/* Timestamp */}
      <span style={{ color: "#555", flexShrink: 0, userSelect: "none" }}>
        [{formatTs(log.timestamp)}]
      </span>
      {/* Session */}
      <span
        style={{ color: "#888", flexShrink: 0, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={log.sessionName}
      >
        [{log.sessionName}]
      </span>
      {/* Type badge + icon */}
      <span className="flex items-center gap-1 flex-shrink-0" style={{ color, minWidth: 56 }}>
        <LogTypeIcon type={log.type} />
        <span style={{ fontSize: 10, fontWeight: 700 }}>{label}</span>
      </span>
      {/* Content */}
      <span
        className="flex-1 min-w-0 break-words"
        style={{ color: "#d4d4d4" }}
      >
        {log.content}
      </span>
    </div>
  );
}

// ── Filter Dropdown ───────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="cursor-pointer"
      style={{
        background: "#1a1a1a",
        border: "1px solid #333",
        color: "#aaa",
        borderRadius: 4,
        padding: "2px 6px",
        fontSize: 11,
        fontFamily: "var(--font-mono, monospace)",
        outline: "none",
      }}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Activity Terminal ─────────────────────────────────────────────────────

interface ActivityTerminalProps {
  open: boolean;
  onToggle: () => void;
}

export function ActivityTerminal({ open, onToggle }: ActivityTerminalProps) {
  const logs = useActivityStore((s) => s.logs);
  const filterSession = useActivityStore((s) => s.filterSession);
  const filterType = useActivityStore((s) => s.filterType);
  const clearLogs = useActivityStore((s) => s.clearLogs);
  const setFilter = useActivityStore((s) => s.setFilter);
  const sessions = useSessionStore((s) => s.sessions);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Build session options from store
  const sessionOptions = useMemo(
    () =>
      Object.values(sessions).map((s) => ({
        value: s.id,
        label: s.projectName ?? s.id.slice(0, 8),
      })),
    [sessions],
  );

  const typeOptions: { value: string; label: string }[] = [
    { value: "thinking", label: "Thinking" },
    { value: "tool_use", label: "Tool Use" },
    { value: "tool_result", label: "Tool Result" },
    { value: "result", label: "Result" },
    { value: "error", label: "Error" },
    { value: "permission", label: "Permission" },
    { value: "cost", label: "Cost" },
  ];

  // Filtered logs
  const displayLogs = useMemo(() => {
    let filtered = logs;
    if (filterSession) filtered = filtered.filter((l) => l.sessionId === filterSession);
    if (filterType) filtered = filtered.filter((l) => l.type === filterType);
    return filtered;
  }, [logs, filterSession, filterType]);

  // Auto-scroll: scroll to bottom on new logs if autoScroll is enabled
  useEffect(() => {
    if (!autoScroll || !scrollRef.current || !open) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [displayLogs, autoScroll, open]);

  // Detect manual scroll: if user scrolls up, disable auto-scroll; if at bottom, re-enable
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distFromBottom < 40);
  }, []);

  const handleClear = useCallback(() => clearLogs(), [clearLogs]);

  const handleFilterSession = useCallback(
    (v: string | null) => setFilter(v, filterType),
    [setFilter, filterType],
  );

  const handleFilterType = useCallback(
    (v: string | null) => setFilter(filterSession, v),
    [setFilter, filterSession],
  );

  return (
    <div
      style={{
        borderTop: "1px solid #2E2E2E",
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: open ? 220 : 32,
        transition: "height 200ms ease",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0"
        style={{
          height: 32,
          borderBottom: open ? "1px solid #1e1e1e" : "none",
          background: "#111",
          userSelect: "none",
        }}
      >
        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-80"
          style={{ color: "#888", background: "none", border: "none", padding: 0 }}
          aria-label={open ? "Collapse activity terminal" : "Expand activity terminal"}
        >
          {open ? (
            <CaretDown size={11} weight="bold" />
          ) : (
            <CaretRight size={11} weight="bold" />
          )}
          <Terminal size={13} color="#4285F4" weight="bold" />
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11,
              fontWeight: 600,
              color: "#888",
              letterSpacing: "0.05em",
            }}
          >
            ACTIVITY LOG
          </span>
        </button>

        {/* Log count badge */}
        <span
          style={{
            background: "#1e1e1e",
            border: "1px solid #2e2e2e",
            borderRadius: 4,
            padding: "0 6px",
            fontSize: 10,
            fontFamily: "var(--font-mono, monospace)",
            color: "#555",
          }}
        >
          {displayLogs.length}
        </span>

        {open && (
          <>
            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Filter: session */}
            <FilterSelect
              value={filterSession}
              onChange={handleFilterSession}
              options={sessionOptions}
              placeholder="All sessions"
            />

            {/* Filter: type */}
            <FilterSelect
              value={filterType}
              onChange={handleFilterType}
              options={typeOptions}
              placeholder="All types"
            />

            {/* Clear */}
            <button
              onClick={handleClear}
              className="flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-80"
              style={{
                color: "#555",
                background: "none",
                border: "none",
                padding: "2px 4px",
                borderRadius: 4,
              }}
              aria-label="Clear activity logs"
              title="Clear logs"
            >
              <Trash size={12} weight="bold" />
            </button>

            {/* Auto-scroll indicator */}
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true);
                  if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  }
                }}
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono, monospace)",
                  color: "#FBBC04",
                  background: "none",
                  border: "1px solid #FBBC04",
                  borderRadius: 4,
                  padding: "1px 6px",
                  cursor: "pointer",
                }}
                aria-label="Resume auto-scroll"
              >
                resume scroll
              </button>
            )}
          </>
        )}
      </div>

      {/* Log list */}
      {open && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#333 transparent",
          }}
        >
          {displayLogs.length === 0 ? (
            <div
              className="flex items-center justify-center h-full"
              style={{
                color: "#333",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 12,
              }}
            >
              No activity yet
            </div>
          ) : (
            /* Logs are stored newest-first, display oldest-first */
            [...displayLogs].reverse().map((log) => (
              <LogLine key={log.id} log={log} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
