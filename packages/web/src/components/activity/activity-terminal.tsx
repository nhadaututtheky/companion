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
import {
  useActivityStore,
  type ActivityLog,
  type ActivityLogType,
} from "@/lib/stores/activity-store";
import { useSessionStore } from "@/lib/stores/session-store";

// ── Constants ──────────────────────────────────────────────────────────────

const LOG_TYPE_COLORS: Record<ActivityLogType, string> = {
  thinking: "var(--color-purple, #a855f7)",
  tool_use: "var(--color-accent)",
  tool_result: "var(--color-success)",
  result: "var(--color-success)",
  error: "var(--color-danger)",
  warning: "var(--color-warning)",
  permission: "var(--color-warning)",
  cost: "var(--color-warning)",
};

const LOG_TYPE_LABELS: Record<ActivityLogType, string> = {
  thinking: "THINK",
  tool_use: "TOOL",
  tool_result: "RESULT",
  result: "DONE",
  error: "ERROR",
  warning: "WARN",
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
    case "warning":
      return <Warning {...props} />;
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
      style={{
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        fontSize: 12,
        lineHeight: "1.6",
      }}
    >
      {/* Timestamp */}
      <span style={{ color: "var(--color-text-muted)", flexShrink: 0, userSelect: "none" }}>
        [{formatTs(log.timestamp)}]
      </span>
      {/* Session */}
      <span
        style={{
          color: "var(--color-text-secondary)",
          flexShrink: 0,
          maxWidth: 100,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
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
      <span className="flex-1 min-w-0 break-words" style={{ color: "var(--color-text-primary)" }}>
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
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border-strong)",
        color: "var(--color-text-secondary)",
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
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-float)",
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
          borderBottom: open ? "1px solid var(--glass-border)" : "none",
          background: "var(--glass-bg-heavy)",
          userSelect: "none",
        }}
      >
        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-80"
          style={{
            color: "var(--color-text-secondary)",
            background: "none",
            border: "none",
            padding: 0,
          }}
          aria-label={open ? "Collapse activity terminal" : "Expand activity terminal"}
        >
          {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
          <Terminal size={13} style={{ color: "var(--color-accent)" }} weight="bold" />
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              letterSpacing: "0.05em",
            }}
          >
            ACTIVITY LOG
          </span>
        </button>

        {/* Log count badge */}
        <span
          style={{
            background: "var(--color-bg-hover)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "0 6px",
            fontSize: 10,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--color-text-muted)",
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
                color: "var(--color-text-muted)",
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
                  color: "var(--color-warning)",
                  background: "none",
                  border: "1px solid var(--color-warning)",
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
            scrollbarColor: "var(--color-border-strong) transparent",
          }}
        >
          {displayLogs.length === 0 ? (
            <div
              className="flex items-center justify-center h-full"
              style={{
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 12,
              }}
            >
              No activity yet
            </div>
          ) : (
            /* Logs are stored newest-first, display oldest-first */
            [...displayLogs].reverse().map((log) => <LogLine key={log.id} log={log} />)
          )}
        </div>
      )}
    </div>
  );
}
