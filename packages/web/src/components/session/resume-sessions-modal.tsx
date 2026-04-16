"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Z } from "@/lib/z-index";
import {
  X,
  MagnifyingGlass,
  ArrowsClockwise,
  Eye,
  Copy,
  Play,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAnimatePresence } from "@/lib/animation";
import { api } from "@/lib/api-client";
import type { ScannedSession, CLIPlatform } from "@companion/shared";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const AGENT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  claude: { label: "Claude Code", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  codex: { label: "Codex", color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  gemini: { label: "Gemini", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  opencode: { label: "OpenCode", color: "#a855f7", bg: "rgba(168,85,247,0.15)" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function truncatePath(p: string, maxLen = 40): string {
  if (p.length <= maxLen) return p;
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 2) return p;
  return `.../${parts.slice(-2).join("/")}`;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ResumeSessionsModalProps {
  open: boolean;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ResumeSessionsModal({ open, onClose }: ResumeSessionsModalProps) {
  const [sessions, setSessions] = useState<ScannedSession[]>([]);
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<CLIPlatform | "">("");
  const [projectFilter, setProjectFilter] = useState("");
  const [page, setPage] = useState(0);

  // Actions
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<ScannedSession | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { shouldRender, animationState } = useAnimatePresence(open, 250, 200);

  // ── Fetch sessions ────────────────────────────────────────────────────

  const fetchSessions = useCallback(
    async (opts?: { resetPage?: boolean }) => {
      setLoading(true);
      try {
        const offset = opts?.resetPage ? 0 : page * PAGE_SIZE;
        if (opts?.resetPage) setPage(0);

        const res = await api.sessions.scan({
          agent: agentFilter || undefined,
          project: projectFilter || undefined,
          q: search || undefined,
          limit: PAGE_SIZE,
          offset,
        });

        if (res.success && res.data) {
          setSessions(res.data.sessions);
          setTotal(res.data.total);
          setProjects(res.data.projects);
        }
      } catch (err) {
        toast.error("Failed to scan sessions");
      } finally {
        setLoading(false);
      }
    },
    [agentFilter, projectFilter, search, page],
  );

  useEffect(() => {
    if (open) fetchSessions({ resetPage: true });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when filters change (debounce search)
  useEffect(() => {
    if (!open) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchSessions({ resetPage: true });
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [agentFilter, projectFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch on page change (no debounce)
  useEffect(() => {
    if (open && page > 0) fetchSessions();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.sessions.scanRefresh();
      await fetchSessions({ resetPage: true });
      toast.success("Scan refreshed");
    } finally {
      setRefreshing(false);
    }
  }, [fetchSessions]);

  const handleResume = useCallback(
    async (session: ScannedSession) => {
      setResumingId(session.id);
      try {
        const res = await api.sessions.start({
          projectDir: session.cwd || session.projectPath || ".",
          resume: true,
          cliPlatform: session.agentType,
        });

        if (res.data?.sessionId) {
          toast.success("Session resumed");
          onClose();
        }
      } catch {
        toast.error("Failed to resume session");
      } finally {
        setResumingId(null);
      }
    },
    [onClose],
  );

  const handleCopyId = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("Session ID copied");
  }, []);

  // ── Render ───────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!shouldRender) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center transition-opacity duration-200"
      style={{
        zIndex: Z.modal,
        opacity: animationState === "entered" ? 1 : 0,
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[var(--bg-card,#1e293b)] shadow-2xl"
        role="dialog"
        aria-label="Resume AI Sessions"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary,#f8fafc)]">
            Resume AI Sessions
          </h2>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-5 py-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            />
            <input
              type="text"
              placeholder="Search sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[var(--bg-elevated,#334155)] py-1.5 pl-9 pr-3 text-sm text-[var(--text-primary,#f8fafc)] placeholder-[var(--text-secondary,#94a3b8)] outline-none transition-colors focus:border-white/20 focus:brightness-110"
            />
          </div>

          {/* Agent filter */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value as CLIPlatform | "")}
            className="cursor-pointer rounded-md border border-white/10 bg-[var(--bg-elevated,#334155)] px-3 py-1.5 text-sm text-[var(--text-primary,#f8fafc)] outline-none transition-colors hover:brightness-110"
          >
            <option value="">All Agents</option>
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
            <option value="gemini">Gemini</option>
            <option value="opencode">OpenCode</option>
          </select>

          {/* Project filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="cursor-pointer rounded-md border border-white/10 bg-[var(--bg-elevated,#334155)] px-3 py-1.5 text-sm text-[var(--text-primary,#f8fafc)] outline-none transition-colors hover:brightness-110"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="cursor-pointer rounded-md border border-white/10 bg-[var(--bg-elevated,#334155)] p-1.5 text-[var(--text-secondary)] transition-colors hover:brightness-110 hover:text-[var(--text-primary)] disabled:opacity-50"
            aria-label="Refresh scan"
          >
            <ArrowsClockwise size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {loading && sessions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text-secondary)]">
              Scanning sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text-secondary)]">
              No sessions found
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {sessions.map((session) => (
                <SessionRow
                  key={`${session.agentType}-${session.id}`}
                  session={session}
                  resumingId={resumingId}
                  onResume={handleResume}
                  onView={setViewingSession}
                  onCopyId={handleCopyId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — pagination */}
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
          <span className="text-xs text-[var(--text-secondary)]">
            {total} session{total !== 1 ? "s" : ""}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="cursor-pointer rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-30"
                aria-label="Previous page"
              >
                <CaretLeft size={14} />
              </button>
              <span className="text-xs text-[var(--text-secondary)]">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="cursor-pointer rounded p-1 text-[var(--text-secondary)] transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-30"
                aria-label="Next page"
              >
                <CaretRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Session detail viewer */}
      {viewingSession && (
        <SessionViewer session={viewingSession} onClose={() => setViewingSession(null)} />
      )}
    </div>,
    document.body,
  );
}

// ── Session Row ─────────────────────────────────────────────────────────────────

function SessionRow({
  session,
  resumingId,
  onResume,
  onView,
  onCopyId,
}: {
  session: ScannedSession;
  resumingId: string | null;
  onResume: (s: ScannedSession) => void;
  onView: (s: ScannedSession) => void;
  onCopyId: (id: string) => void;
}) {
  const agent = AGENT_LABELS[session.agentType] || AGENT_LABELS.claude;
  const isResuming = resumingId === session.id;

  return (
    <div className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]">
      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Agent badge + project path */}
        <div className="mb-1 flex items-center gap-2">
          <span
            className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold"
            style={{ color: agent.color, backgroundColor: agent.bg }}
          >
            {agent.label}
          </span>
          <span className="truncate text-xs text-[var(--text-secondary)]">
            {truncatePath(session.projectPath || session.cwd)}
          </span>
        </div>

        {/* First prompt / preview */}
        <p className="line-clamp-2 text-sm text-[var(--text-primary,#f8fafc)] opacity-80">
          {session.firstPrompt || (
            <span className="italic text-[var(--text-secondary)]">(no preview available)</span>
          )}
        </p>

        {/* Meta: turns + timestamp */}
        <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span>
            {session.turnCount} turn{session.turnCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Right: timestamp + actions */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-xs text-[var(--text-secondary)]">
          {timeAgo(session.lastActivityAt)}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onView(session)}
            className="cursor-pointer rounded px-2 py-1 text-xs text-[var(--text-secondary)] opacity-0 transition-all hover:bg-white/10 hover:text-[var(--text-primary)] group-hover:opacity-100"
            aria-label="View session"
          >
            View
          </button>
          <button
            onClick={() => onCopyId(session.id)}
            className="cursor-pointer rounded px-2 py-1 text-xs text-[var(--text-secondary)] opacity-0 transition-all hover:bg-white/10 hover:text-[var(--text-primary)] group-hover:opacity-100"
            aria-label="Copy session ID"
          >
            Copy ID
          </button>
          <button
            onClick={() => onResume(session)}
            disabled={isResuming}
            className="cursor-pointer rounded bg-[var(--accent,#2196f3)] px-3 py-1 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
            aria-label="Resume session"
          >
            {isResuming ? "..." : "Resume"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session Viewer (detail panel) ──────────────────────────────────────────────

function SessionViewer({ session, onClose }: { session: ScannedSession; onClose: () => void }) {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [resumeCmd, setResumeCmd] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.sessions.scanDetail(session.agentType, session.id);
        if (!cancelled && res.success && res.data) {
          setMessages(res.data.messages);
          setResumeCmd(res.data.resumeCommand);
        }
      } catch {
        toast.error("Failed to load session detail");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const agent = AGENT_LABELS[session.agentType] || AGENT_LABELS.claude;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: Z.modal + 1 }}>
      <div
        className="absolute inset-0 bg-black/40"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden
      />
      <div className="relative flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-white/10 bg-[var(--bg-card,#1e293b)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{ color: agent.color, backgroundColor: agent.bg }}
            >
              {agent.label}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              {truncatePath(session.projectPath || session.cwd)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-[var(--text-secondary)] hover:bg-white/10"
            aria-label="Close viewer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Resume command */}
        {resumeCmd && (
          <div className="border-b border-white/5 px-5 py-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-white/5 px-3 py-1.5 text-xs text-[var(--text-primary)]">
                {resumeCmd}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resumeCmd);
                  toast.success("Command copied");
                }}
                className="cursor-pointer rounded p-1 text-[var(--text-secondary)] hover:bg-white/10"
                aria-label="Copy resume command"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-[var(--text-secondary)]">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-[var(--text-secondary)]">
              No messages found
            </div>
          ) : (
            <div className="space-y-3">
              {messages.slice(0, 50).map((msg, i) => (
                <div key={i} className="text-sm">
                  <span
                    className={`mb-0.5 block text-xs font-medium ${
                      msg.role === "user"
                        ? "text-[var(--accent,#2196f3)]"
                        : "text-[var(--profit,#00d084)]"
                    }`}
                  >
                    {msg.role === "user" ? "User" : "AI"}
                  </span>
                  <p className="whitespace-pre-wrap text-[var(--text-primary)] opacity-80">
                    {msg.content.slice(0, 500)}
                    {msg.content.length > 500 && "..."}
                  </p>
                </div>
              ))}
              {messages.length > 50 && (
                <p className="text-center text-xs text-[var(--text-secondary)]">
                  ... and {messages.length - 50} more messages
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
