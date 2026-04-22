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
  DownloadSimple,
} from "@phosphor-icons/react";
import { APP_VERSION } from "@companion/shared";
import { useLicenseStore } from "@/lib/stores/license-store";
import {
  useActivityStore,
  type ActivityLog,
  type ActivityLogType,
} from "@/lib/stores/activity-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUpdateCheck } from "@/hooks/use-update-check";

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
      className="flex items-start gap-2 px-3 py-0.5 transition-colors hover:bg-white/5"
      style={{
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        fontSize: 12,
        lineHeight: "1.6",
      }}
    >
      {/* Timestamp */}
      <span className="text-text-muted select-none" style={{ flexShrink: 0 }}>
        [{formatTs(log.timestamp)}]
      </span>
      {/* Session */}
      <span
        className="text-text-secondary shrink-0 overflow-hidden whitespace-nowrap"
        style={{
          maxWidth: 100,
          textOverflow: "ellipsis",
        }}
        title={log.sessionName}
      >
        [{log.sessionName}]
      </span>
      {/* Type badge + icon */}
      <span className="flex flex-shrink-0 items-center gap-1" style={{ color, minWidth: 56 }}>
        <LogTypeIcon type={log.type} />
        <span className="font-bold" style={{ fontSize: 10 }}>
          {label}
        </span>
      </span>
      {/* Content */}
      <span className="text-text-primary min-w-0 flex-1 break-words">{log.content}</span>
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
      className="text-text-secondary bg-bg-elevated border-border-strong cursor-pointer rounded border px-1.5 py-px font-mono text-[11px] outline-none"
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

// ── Version Badge ─────────────────────────────────────────────────────────

/**
 * Always-visible version display embedded in the Activity Terminal header.
 * Shows the current app version; when an update is available, swaps to a
 * highlighted "v{new} available" badge that opens the update banner on click.
 *
 * Reuses `useUpdateCheck` — the same hook `UpdateBanner` subscribes to, so
 * both surfaces share a single HTTP polling + Tauri event listener pair.
 */
function VersionBadge() {
  const { update, dismissed, undismiss } = useUpdateCheck();
  const hasUpdate = !!update?.available;

  if (hasUpdate) {
    const latest = update!.latestVersion;
    return (
      <button
        onClick={() => {
          if (dismissed) undismiss();
        }}
        className="text-accent flex cursor-pointer items-center gap-1 rounded px-1.5 py-px font-mono text-[10px] transition-opacity hover:opacity-80"
        style={{
          background: "var(--color-accent)15",
          border: "1px solid var(--color-accent)40",
        }}
        aria-label={`Update to v${latest} available`}
        title={`Update to v${latest} available — click to ${dismissed ? "reopen" : "open"} update dialog`}
      >
        <DownloadSimple size={10} weight="bold" />
        <span>v{latest}</span>
      </button>
    );
  }

  return (
    <span
      className="text-text-muted rounded bg-transparent px-1.5 py-px font-mono text-[10px]"
      title="Companion — up to date"
    >
      v{APP_VERSION}
    </span>
  );
}

// ── Tier Badge ────────────────────────────────────────────────────────────

/**
 * Always-visible tier pill sitting next to the version badge. Free / trial
 * users see a clickable orange "Go Pro" chip that opens the upgrade modal;
 * Pro users see a muted confirmation pill (no action).
 */
function TierBadge() {
  const tier = useLicenseStore((s) => s.tier);
  const daysLeft = useLicenseStore((s) => s.daysLeft);
  const loaded = useLicenseStore((s) => s.loaded);
  const promptUpgrade = useLicenseStore((s) => s.promptUpgrade);

  if (!loaded) return null;

  if (tier === "pro") {
    return (
      <span
        className="text-success rounded px-1.5 py-px font-mono text-[10px] font-semibold"
        style={{
          background: "color-mix(in srgb, var(--color-success) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)",
        }}
        title="Pro license active"
      >
        PRO
      </span>
    );
  }

  const label =
    tier === "trial"
      ? daysLeft != null
        ? `TRIAL · ${daysLeft}d`
        : "TRIAL"
      : "FREE → Go Pro";

  const accent = tier === "trial" ? "var(--color-warning)" : "var(--color-accent)";

  return (
    <button
      type="button"
      onClick={() =>
        promptUpgrade(
          tier === "trial"
            ? "Keep Pro features after your trial ends"
            : "Unlock unlimited sessions + Pro intelligence",
        )
      }
      className="cursor-pointer rounded px-1.5 py-px font-mono text-[10px] font-semibold transition-opacity hover:opacity-90"
      style={{
        color: accent,
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
      }}
      aria-label={tier === "trial" ? "Trial active — click to upgrade" : "Free tier — click to go Pro"}
      title={
        tier === "trial"
          ? `Trial${daysLeft != null ? ` — ${daysLeft} days left` : ""} · click to upgrade`
          : "Free tier · click to see Pro features"
      }
    >
      {label}
    </button>
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
  const sessionOptions = useMemo(
    () =>
      Object.values(sessions).map((sess) => ({
        value: sess.id,
        label: sess.projectName ?? sess.id.slice(0, 8),
      })),
    [sessions],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

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
      className="shadow-soft flex shrink-0 overflow-hidden rounded-xl"
      style={{
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--shadow-float)",
        flexDirection: "column",
        height: open ? 220 : 32,
        transition: "height 200ms ease",
      }}
    >
      {/* Header bar */}
      <div
        className="flex flex-shrink-0 select-none items-center gap-2 px-3"
        style={{
          height: 32,
          boxShadow: open ? "0 1px 0 var(--glass-border)" : "none",
          background: "var(--glass-bg-heavy)",
        }}
      >
        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="text-text-secondary flex cursor-pointer items-center gap-1.5 transition-opacity hover:opacity-80"
          style={{
            background: "none",
            border: "none",
            padding: 0,
          }}
          aria-label={open ? "Collapse activity terminal" : "Expand activity terminal"}
        >
          {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
          <Terminal size={13} className="text-accent" weight="bold" />
          <span
            className="text-text-secondary font-semibold"
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11,
              letterSpacing: "0.05em",
            }}
          >
            ACTIVITY LOG
          </span>
        </button>

        {/* Log count badge */}
        <span className="text-text-muted bg-bg-hover rounded px-1.5 font-mono text-[10px]">
          {displayLogs.length}
        </span>

        {/* Spacer (always on — pushes version badge + filters to the right) */}
        <div style={{ flex: 1 }} />

        {/* Tier + version badges — always visible, collapsed or expanded */}
        <TierBadge />
        <VersionBadge />

        {open && (
          <>
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
              className="text-text-muted flex cursor-pointer items-center gap-1 transition-opacity hover:opacity-80"
              style={{
                background: "none",
                border: "none",
                padding: "2px 4px",
                borderRadius: "var(--radius-sm)",
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
                className="text-warning cursor-pointer rounded bg-transparent px-1.5 py-px font-mono text-[10px]"
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
              className="text-text-muted flex h-full items-center justify-center"
              style={{
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
