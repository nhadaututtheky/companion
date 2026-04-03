"use client";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  FolderOpen,
  MagnifyingGlass,
  Tag,
  X,
  SortAscending,
  SortDescending,
  CaretUpDown,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/lib/stores/session-store";

interface SessionItem {
  id: string;
  shortId?: string;
  projectName: string;
  model: string;
  status: string;
  totalCostUsd: number;
  numTurns: number;
  createdAt: number;
  tags?: string[];
}

interface SessionListProps {
  sessions: SessionItem[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

// ── Sort types ─────────────────────────────────────────────────────────────

type SortKey = "date" | "cost" | "tokens" | "name";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "cost", label: "Cost" },
  { key: "tokens", label: "Turns" },
  { key: "name", label: "Name" },
];

const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  cost: "desc",
  tokens: "desc",
  name: "asc",
};

// ── Model badge helper ──────────────────────────────────────────────────────

function modelBadge(model: string): { label: string; color: string; bg: string } {
  const m = model.toLowerCase();
  if (m.includes("opus")) return { label: "O", color: "#9C27B0", bg: "#9C27B015" };
  if (m.includes("haiku")) return { label: "H", color: "#FF9800", bg: "#FF980015" };
  return { label: "S", color: "#4285F4", bg: "#4285F415" };
}

// ── Status dot ─────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

function StatusDot({ status }: { status: string }) {
  const configs: Record<string, { color: string; label: string; pulse?: boolean }> = {
    starting: { color: "#FBBC04", label: "Starting" },
    running: { color: "#4285F4", label: "Running" },
    busy: { color: "#4285F4", label: "Busy" },
    waiting: { color: "#FBBC04", label: "Waiting" },
    idle: { color: "#34A853", label: "Idle", pulse: true },
    ended: { color: "#A0A0A0", label: "Ended" },
    error: { color: "#EA4335", label: "Error" },
  };

  const config = configs[status] ?? configs.idle!;
  const isActive = ACTIVE_STATUSES.has(status);

  return (
    <span
      title={config.label}
      style={{ position: "relative", display: "inline-flex", flexShrink: 0, width: 8, height: 8 }}
    >
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: config.color,
            opacity: 0.4,
            animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
          }}
        />
      )}
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: config.color,
          position: "relative",
        }}
      />
    </span>
  );
}

function formatCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatTime(ts: number) {
  if (!ts || ts <= 0) return "just now";
  const diff = Date.now() - ts;
  if (diff < 0 || diff > 365 * 86_400_000) return "just now";
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// Rotate through these colors for tag chips
const TAG_COLORS = [
  { bg: "#4285F420", text: "#4285F4" }, // blue
  { bg: "#34A85320", text: "#34A853" }, // green
  { bg: "#9C27B020", text: "#9C27B0" }, // purple
  { bg: "#FF980020", text: "#FF9800" }, // orange
  { bg: "#E91E6320", text: "#E91E63" }, // pink
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) & 0xffff;
  }
  return TAG_COLORS[hash % TAG_COLORS.length]!;
}

// ── Debounce hook ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Inline tag input popup ─────────────────────────────────────────────────

interface TagInputProps {
  onAdd: (tag: string) => void;
  onClose: () => void;
}

function TagInput({ onAdd, onClose }: TagInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const trimmed = value.trim();
      if (trimmed) {
        onAdd(trimmed);
        setValue("");
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1" style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onClose}
        placeholder="Tag name…"
        maxLength={50}
        className="text-xs px-2 py-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent w-24"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        }}
        aria-label="Enter tag name"
      />
    </div>
  );
}

// ── Tag chips for a session row ────────────────────────────────────────────

interface SessionTagsProps {
  sessionId: string;
  tags: string[];
}

function SessionTags({ sessionId, tags }: SessionTagsProps) {
  const [showInput, setShowInput] = useState(false);
  const setSession = useSessionStore((s) => s.setSession);

  const handleAddTag = useCallback(
    async (tag: string) => {
      const next = tags.includes(tag) ? tags : [...tags, tag];
      setShowInput(false);
      try {
        await api.sessions.updateTags(sessionId, next);
        setSession(sessionId, { tags: next });
      } catch {
        // silently ignore
      }
    },
    [sessionId, tags, setSession],
  );

  const handleRemoveTag = useCallback(
    async (tag: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const next = tags.filter((t) => t !== tag);
      try {
        await api.sessions.updateTags(sessionId, next);
        setSession(sessionId, { tags: next });
      } catch {
        // silently ignore
      }
    },
    [sessionId, tags, setSession],
  );

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowInput((v) => !v);
  };

  if (tags.length === 0 && !showInput) {
    return (
      <button
        onClick={handleAddClick}
        className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded cursor-pointer transition-opacity opacity-0 group-hover:opacity-60 hover:!opacity-100"
        style={{ color: "var(--color-text-muted)", background: "transparent" }}
        aria-label="Add tag"
        title="Add tag"
      >
        <Tag size={10} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 pl-4" onClick={(e) => e.stopPropagation()}>
      {tags.map((tag) => {
        const color = getTagColor(tag);
        return (
          <span
            key={tag}
            className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: color.bg, color: color.text }}
          >
            {tag}
            <button
              onClick={(e) => handleRemoveTag(tag, e)}
              className="ml-0.5 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
              aria-label={`Remove tag ${tag}`}
              style={{ lineHeight: 1 }}
            >
              <X size={8} weight="bold" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <button
        onClick={handleAddClick}
        className="flex items-center text-xs px-1 py-0.5 rounded cursor-pointer transition-colors"
        style={{ color: "var(--color-text-muted)", background: "transparent" }}
        aria-label="Add tag"
        title="Add tag"
      >
        <Plus size={10} weight="bold" aria-hidden="true" />
      </button>
      {showInput && <TagInput onAdd={handleAddTag} onClose={() => setShowInput(false)} />}
    </div>
  );
}

// ── Main SessionList ───────────────────────────────────────────────────────

export function SessionList({ sessions, activeSessionId, onSelect, onNew }: SessionListProps) {
  const [filter, setFilter] = useState<"all" | "active" | "ended">("active");
  const [searchRaw, setSearchRaw] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const search = useDebounce(searchRaw, 300);

  const handleSortClick = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir(DEFAULT_SORT_DIR[key]);
      return key;
    });
  }, []);

  // Collect all unique tags across all sessions
  const allTags = useMemo(
    () => Array.from(new Set(sessions.flatMap((s) => s.tags ?? []))).sort(),
    [sessions],
  );

  const active = useMemo(() => sessions.filter((s) => ACTIVE_STATUSES.has(s.status)), [sessions]);
  const ended = useMemo(
    () => sessions.filter((s) => ["ended", "error"].includes(s.status)),
    [sessions],
  );
  const filtered = filter === "all" ? sessions : filter === "active" ? active : ended;
  const q = search.trim().toLowerCase();

  const displayed = useMemo(() => {
    const base = filtered.filter((s) => {
      if (tagFilter && !(s.tags ?? []).includes(tagFilter)) return false;
      if (!q) return true;
      return (
        s.projectName.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.shortId?.toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });

    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.createdAt - b.createdAt;
      else if (sortKey === "cost") cmp = a.totalCostUsd - b.totalCostUsd;
      else if (sortKey === "tokens") cmp = a.numTurns - b.numTurns;
      else if (sortKey === "name") cmp = a.projectName.localeCompare(b.projectName);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, tagFilter, q, sortKey, sortDir]);

  return (
    <div className="flex flex-col h-full">
      {/* Keyframe for pulsing dot — injected once */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm font-semibold">
          Sessions
          {active.length > 0 && (
            <span
              className="ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: "#4285F420", color: "#4285F4" }}
            >
              {active.length}
            </span>
          )}
        </span>
        <button
          onClick={onNew}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer"
          style={{ background: "#34A853", color: "#fff" }}
          aria-label="New session"
        >
          <Plus size={12} weight="bold" /> New
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-1.5">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
          }}
        >
          <MagnifyingGlass
            size={12}
            style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Search sessions..."
            className="flex-1 text-xs bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
           
            aria-label="Search sessions"
          />
          {searchRaw && (
            <button
              onClick={() => setSearchRaw("")}
              className="cursor-pointer transition-opacity hover:opacity-100 opacity-60"
              style={{ color: "var(--color-text-muted)", lineHeight: 1 }}
              aria-label="Clear search"
            >
              <X size={11} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Sort controls */}
      <div
        className="flex items-center gap-0.5 px-3 pb-1.5"
        role="group"
        aria-label="Sort sessions"
      >
        <CaretUpDown
          size={10}
          style={{ color: "var(--color-text-muted)", flexShrink: 0, marginRight: 2 }}
          aria-hidden="true"
        />
        {SORT_OPTIONS.map(({ key, label }) => {
          const active = sortKey === key;
          return (
            <button
              key={key}
              onClick={() => handleSortClick(key)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors"
              style={{
                background: active ? "var(--color-bg-elevated)" : "transparent",
                color: active ? "var(--color-text-primary)" : "var(--color-text-muted)",
              }}
              aria-pressed={active}
              aria-label={`Sort by ${label} ${active ? (sortDir === "asc" ? "ascending" : "descending") : ""}`}
            >
              {label}
              {active &&
                (sortDir === "asc" ? (
                  <SortAscending size={10} weight="bold" aria-hidden="true" />
                ) : (
                  <SortDescending size={10} weight="bold" aria-hidden="true" />
                ))}
            </button>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1 mb-1">
        {(["active", "all", "ended"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer capitalize"
            style={{
              background: filter === f ? "var(--color-bg-elevated)" : "transparent",
              color: filter === f ? "var(--color-text-primary)" : "var(--color-text-muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {tagFilter !== null && (
            <button
              onClick={() => setTagFilter(null)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
              }}
              aria-label="Clear tag filter"
            >
              All
            </button>
          )}
          {allTags.map((tag) => {
            const color = getTagColor(tag);
            const isActive = tagFilter === tag;
            return (
              <button
                key={tag}
                onClick={() => setTagFilter(isActive ? null : tag)}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all"
                style={{
                  background: isActive ? color.text : color.bg,
                  color: isActive ? "#fff" : color.text,
                  outline: isActive ? `2px solid ${color.text}` : "none",
                }}
                aria-pressed={isActive}
                aria-label={`Filter by tag: ${tag}`}
              >
                <Tag size={9} aria-hidden="true" />
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <FolderOpen size={28} />
            <p className="text-xs">
              {filter === "active" ? "No active sessions" : "No sessions"}
            </p>
          </div>
        )}

        {displayed.map((s) => {
          const badge = modelBadge(s.model);
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
              role="button"
              tabIndex={0}
              className="group w-full flex flex-col gap-1 px-4 py-2.5 text-left transition-all cursor-pointer rounded-lg mx-2"
              style={{
                background: activeSessionId === s.id ? "var(--color-bg-hover)" : "transparent",
                width: "calc(100% - 16px)",
              }}
            >
              {/* Row 1: dot · shortId · name · cost */}
              <div className="flex items-center gap-2">
                <StatusDot status={s.status} />
                {s.shortId && (
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "var(--color-bg-elevated)", color: "#34A853" }}
                    title={`@${s.shortId} — use in chat to mention this session`}
                  >
                    @{s.shortId}
                  </span>
                )}
                <span
                  className="text-sm font-medium truncate flex-1"
                 
                >
                  {s.projectName}
                </span>
                {s.totalCostUsd > 0 && (
                  <span
                    className="text-xs font-mono shrink-0"
                   
                  >
                    {formatCost(s.totalCostUsd)}
                  </span>
                )}
              </div>
              {/* Row 2: model badge · turns · time */}
              <div className="flex items-center gap-2 pl-4">
                {/* Model badge: S / O / H */}
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: badge.bg,
                    color: badge.color,
                    minWidth: 18,
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}
                  title={s.model}
                  aria-label={`Model: ${s.model}`}
                >
                  {badge.label}
                </span>
                <span className="text-xs">
                  {s.numTurns} turns
                </span>
                <span className="text-xs ml-auto">
                  {formatTime(s.createdAt)}
                </span>
              </div>
              {/* Tags row */}
              <SessionTags sessionId={s.id} tags={s.tags ?? []} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
