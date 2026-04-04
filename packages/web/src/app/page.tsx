"use client";
import { useEffect, useMemo, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArrowCounterClockwise, X, TelegramLogo, Globe, Trash } from "@phosphor-icons/react";
import { Header } from "@/components/layout/header";
import { SessionList } from "@/components/session/session-list";
// StatsGrid moved to Header
import { ExpandedSession } from "@/components/grid/expanded-session";
import { MultiSessionLayout } from "@/components/layout/multi-session-layout";
import { NewSessionModal } from "@/components/session/new-session-modal";
import { CompanionLogo } from "@/components/layout/companion-logo";
import { ActivityTerminal } from "@/components/activity/activity-terminal";
import { MagicRing } from "@/components/ring/magic-ring";
import { FileExplorerPanel } from "@/components/panels/file-explorer-panel";
import { BrowserPreviewPanel } from "@/components/panels/browser-preview-panel";
import { SearchPanel } from "@/components/panels/search-panel";
import { TerminalPanel } from "@/components/panels/terminal-panel";
import { StatsPanel } from "@/components/panels/stats-panel";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useNotificationPermission } from "@/hooks/use-notifications";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { ApiKeyIndicator } from "@/components/auth/api-key-indicator";
import dynamic from "next/dynamic";

const AiContextPanel = dynamic(
  () => import("@/components/panels/ai-context-panel").then((m) => ({ default: m.AiContextPanel })),
  { ssr: false },
);
const OnboardingWizard = dynamic(
  () => import("@/components/onboarding-wizard").then((m) => ({ default: m.OnboardingWizard })),
  { ssr: false },
);

// ── Empty center state ─────────────────────────────────────────────────────

function EmptyCenter() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <CompanionLogo size="lg" />
      <p className="text-base text-center" style={{ color: "var(--color-text-secondary)" }}>
        Select a session or start a new one
      </p>
    </div>
  );
}

// SidebarStats removed — stats now in Header

// ── Session Management Bar ─────────────────────────────────────────────────

function SessionManagementBar() {
  const [clearing, setClearing] = useState(false);
  const [killing, setKilling] = useState(false);

  const sessions = useSessionStore((s) => s.sessions);
  const removeSession = useSessionStore((s) => s.removeSession);

  const endedIds = useMemo(
    () =>
      Object.values(sessions)
        .filter((s) => ["ended", "error"].includes(s.status))
        .map((s) => s.id),
    [sessions],
  );
  const activeIds = useMemo(
    () =>
      Object.values(sessions)
        .filter((s) => ["starting", "running", "waiting", "idle", "busy"].includes(s.status))
        .map((s) => s.id),
    [sessions],
  );

  const handleClearEnded = useCallback(async () => {
    if (endedIds.length === 0) return;
    setClearing(true);
    try {
      for (const id of endedIds) {
        removeSession(id);
      }
    } finally {
      setClearing(false);
    }
  }, [endedIds, removeSession]);

  const handleKillAll = useCallback(async () => {
    if (activeIds.length === 0) return;
    if (!window.confirm(`Stop all ${activeIds.length} active session(s)?`)) return;
    setKilling(true);
    try {
      await api.sessions.killAll(activeIds);
      for (const id of activeIds) {
        useSessionStore.getState().setSession(id, {
          ...useSessionStore.getState().sessions[id]!,
          status: "ended",
          shortId: undefined,
        });
      }
    } catch {
      // ignore individual failures
    } finally {
      setKilling(false);
    }
  }, [activeIds]);

  if (endedIds.length === 0 && activeIds.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2">
      {endedIds.length > 0 && (
        <button
          onClick={handleClearEnded}
          disabled={clearing}
          className="flex-1 text-xs py-1 px-2 rounded cursor-pointer transition-colors font-medium"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-secondary)",
            opacity: clearing ? 0.6 : 1,
          }}
          aria-label={`Clear ${endedIds.length} ended session(s)`}
        >
          {clearing ? "Clearing..." : `Clear ${endedIds.length} ended`}
        </button>
      )}
      {activeIds.length > 0 && (
        <button
          onClick={handleKillAll}
          disabled={killing}
          className="flex-1 text-xs py-1 px-2 rounded cursor-pointer transition-colors font-medium"
          style={{
            background: killing ? "#EA433520" : "#EA433515",
            color: "#EA4335",
            opacity: killing ? 0.7 : 1,
          }}
          aria-label={`Stop all ${activeIds.length} active session(s)`}
        >
          {killing ? "Stopping..." : `Kill all (${activeIds.length})`}
        </button>
      )}
    </div>
  );
}

// ── Resumable Sessions Banner ──────────────────────────────────────────────

interface ResumableSession {
  id: string;
  projectSlug: string | null;
  model: string;
  source: string;
  cwd: string;
  cliSessionId: string;
  endedAt: number;
}

interface ResumeBannerProps {
  sessions: ResumableSession[];
  onResume: (id: string) => void;
  onDismissOne: (id: string) => void;
  onDismiss: () => void;
}

function ResumeBanner({ sessions, onResume, onDismissOne, onDismiss }: ResumeBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);

  const handleResume = useCallback(
    async (id: string) => {
      setResumingId(id);
      try {
        await onResume(id);
      } finally {
        setResumingId(null);
      }
    },
    [onResume],
  );

  const projectLabel = (s: ResumableSession) => {
    if (s.projectSlug) return s.projectSlug;
    const parts = s.cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? s.cwd;
  };

  const modelShort = (model: string) =>
    model.includes("opus") ? "Opus" : model.includes("haiku") ? "Haiku" : "Sonnet";

  const SourceIcon = ({ source }: { source: string }) => {
    if (source === "telegram")
      return (
        <TelegramLogo
          size={12}
          weight="fill"
          style={{ color: "#29B6F6" }}
          aria-label="From Telegram"
        />
      );
    return <Globe size={12} style={{ color: "var(--color-text-muted)" }} aria-label="From Web" />;
  };

  return (
    <div
      style={{
        background: "#4285F410",
        borderBottom: "1px solid #4285F430",
      }}
    >
      {/* Summary row */}
      <div className="flex items-center gap-2 px-4 py-2">
        <ArrowCounterClockwise size={14} color="#4285F4" weight="bold" aria-hidden="true" />
        <span className="text-xs font-semibold flex-1" style={{ color: "#4285F4" }}>
          {sessions.length === 1
            ? "1 session can be resumed"
            : `${sessions.length} sessions can be resumed`}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer transition-colors"
          style={{
            color: "#4285F4",
            background: "#4285F415",
          }}
          aria-expanded={expanded}
        >
          {expanded ? "Hide" : "Show"}
        </button>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded cursor-pointer"
          style={{ color: "#4285F480" }}
          aria-label="Dismiss resume banner"
        >
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {/* Expanded session list */}
      {expanded && (
        <div className="flex flex-col" style={{ borderTop: "1px solid #4285F420" }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-2"
              style={{ borderBottom: "1px solid #4285F415" }}
            >
              <SourceIcon source={s.source} />
              <div className="flex flex-col flex-1 min-w-0">
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {projectLabel(s)}
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {modelShort(s.model)} &bull;{" "}
                  {new Date(s.endedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <button
                onClick={() => onDismissOne(s.id)}
                className="p-1.5 rounded cursor-pointer transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{ color: "var(--color-text-muted)" }}
                aria-label={`Dismiss session ${projectLabel(s)}`}
              >
                <Trash size={12} weight="bold" aria-hidden="true" />
              </button>
              <button
                onClick={() => handleResume(s.id)}
                disabled={resumingId === s.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                style={{ background: "#4285F4", color: "#fff" }}
                aria-label={`Resume session for ${projectLabel(s)}`}
              >
                <ArrowCounterClockwise
                  size={11}
                  weight="bold"
                  className={resumingId === s.id ? "animate-spin" : ""}
                  aria-hidden="true"
                />
                {resumingId === s.id ? "Resuming..." : "Resume"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root page ──────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ["starting", "running", "waiting", "idle", "busy"];

export default function DashboardPage() {
  const newSessionOpen = useUiStore((s) => s.newSessionModalOpen);
  const setNewSessionOpen = useUiStore((s) => s.setNewSessionModalOpen);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const rightPanelPath = useUiStore((s) => s.rightPanelPath);
  const browserPreviewUrl = useUiStore((s) => s.browserPreviewUrl);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const setRightPanelPath = useUiStore((s) => s.setRightPanelPath);
  const [resumableSessions, setResumableSessions] = useState<ResumableSession[]>([]);
  const [resumeBannerDismissed, setResumeBannerDismissed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Request browser notification permission on first load
  useNotificationPermission();

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    gridOrder,
    addToGrid,
    expandedSessionId,
    setExpandedSession,
    closedIds,
  } = useSessionStore(
    useShallow((s) => ({
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      setActiveSession: s.setActiveSession,
      gridOrder: s.gridOrder,
      addToGrid: s.addToGrid,
      expandedSessionId: s.expandedSessionId,
      setExpandedSession: s.setExpandedSession,
      closedIds: s.closedIds,
    })),
  );

  const sessionList = useMemo(
    () =>
      Object.values(sessions).map((s) => ({
        id: s.id,
        shortId: s.shortId ?? s.state?.short_id,
        projectName: s.projectName,
        model: s.model,
        status: s.status,
        totalCostUsd: s.state?.total_cost_usd ?? 0,
        numTurns: s.state?.num_turns ?? 0,
        createdAt: s.createdAt,
        tags: s.tags ?? [],
      })),
    [sessions],
  );

  // Ordered active sessions for grid (up to 6)
  const gridSessions = useMemo(() => {
    const active = Object.values(sessions).filter((s) => ACTIVE_STATUSES.includes(s.status));

    // Use gridOrder for ordering, fallback to insertion order
    const ordered = gridOrder
      .map((id) => sessions[id])
      .filter((s): s is NonNullable<typeof s> => !!s && ACTIVE_STATUSES.includes(s.status));

    // Add any active sessions not yet in gridOrder (unless user closed them)
    for (const s of active) {
      if (!ordered.find((o) => o.id === s.id) && !closedIds.has(s.id)) {
        ordered.push(s);
      }
    }

    return ordered.slice(0, 6).map((s) => ({
      id: s.id,
      projectName: s.projectName,
      model: s.model,
      status: s.status,
    }));
  }, [sessions, gridOrder, closedIds]);

  // Fetch sessions on mount
  useEffect(() => {
    api.sessions
      .list()
      .then((res) => {
        const data = res.data as {
          sessions: Array<{
            id: string;
            shortId?: string;
            projectSlug: string;
            status: string;
            model: string;
            totalCostUsd: number;
            numTurns: number;
            createdAt: string;
            state: unknown;
          }>;
        };

        for (const s of data.sessions ?? []) {
          // Only load active sessions — skip ended/error to keep sidebar clean
          if (!ACTIVE_STATUSES.includes(s.status)) continue;

          useSessionStore.getState().setSession(s.id, {
            id: s.id,
            shortId: s.shortId,
            projectSlug: s.projectSlug,
            projectName: s.projectSlug || "session",
            model: s.model,
            status: s.status,
            state: s.state as unknown as import("@companion/shared").SessionState,
            createdAt: new Date(s.createdAt).getTime() || Date.now(),
            tags: (s as { tags?: string[] }).tags ?? [],
          });
          useSessionStore.getState().addToGrid(s.id);
        }
      })
      .catch(() => {
        // Server might not be running yet
      });
  }, []);

  // Fetch resumable sessions on mount
  useEffect(() => {
    api.sessions
      .listResumable()
      .then((res) => {
        if (res.data && res.data.length > 0) {
          setResumableSessions(res.data);
        }
      })
      .catch(() => {
        // Server might not be running yet
      });
  }, []);

  const handleResume = useCallback(
    async (id: string) => {
      try {
        const res = await api.sessions.resume(id);
        const sessionId = res.data.sessionId;

        // Find original session data
        const original = resumableSessions.find((s) => s.id === id);
        const projectSlug = original?.projectSlug ?? "session";
        const modelShort = original?.model ?? "claude-sonnet-4-6";

        // Derive display name from cwd (folder name), not slug
        const cwdParts = (original?.cwd ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
        const projectName = cwdParts[cwdParts.length - 1] ?? projectSlug;

        useSessionStore.getState().setSession(sessionId, {
          id: sessionId,
          projectSlug,
          projectName,
          model: modelShort,
          status: "starting",
          createdAt: Date.now(),
        });

        useSessionStore.getState().addToGrid(sessionId);
        useSessionStore.getState().setActiveSession(sessionId);

        // Remove the resumed session from the resumable list
        setResumableSessions((prev) => prev.filter((s) => s.id !== id));

        toast.success(`Resuming session: ${projectSlug}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to resume session");
        throw err;
      }
    },
    [resumableSessions],
  );

  // When a session is selected from the list, add it to the grid
  const handleSelectSession = useCallback(
    (id: string) => {
      setActiveSession(id);
      addToGrid(id);
    },
    [setActiveSession, addToGrid],
  );

  const handleNewSession = useCallback(() => {
    setNewSessionOpen(true);
  }, [setNewSessionOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+N / Cmd+N — new session
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        if (!expandedSessionId) {
          e.preventDefault();
          setNewSessionOpen(true);
        }
      }
      // Ctrl+` — toggle activity terminal
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setActivityTerminalOpen(!activityTerminalOpen);
      }
      // Ctrl+S or Escape — close expanded session / right panel
      if ((e.ctrlKey && e.key === "s") || e.key === "Escape") {
        if (expandedSessionId) {
          e.preventDefault();
          setExpandedSession(null);
        } else if (rightPanelMode !== "none") {
          e.preventDefault();
          setRightPanelMode("none");
        }
      }
      // Ctrl+K — open search panel
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        setRightPanelMode("search");
      }
      // Ctrl+1 through Ctrl+6 — switch to session by grid position
      if (e.ctrlKey && e.key >= "1" && e.key <= "6") {
        const index = parseInt(e.key, 10) - 1;
        const targetId = gridOrder[index];
        if (targetId) {
          e.preventDefault();
          setActiveSession(targetId);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    expandedSessionId,
    setNewSessionOpen,
    activityTerminalOpen,
    setActivityTerminalOpen,
    setExpandedSession,
    rightPanelMode,
    setRightPanelMode,
    gridOrder,
    setActiveSession,
  ]);

  const handleCloseNewSession = useCallback(() => {
    setNewSessionOpen(false);
  }, [setNewSessionOpen]);

  const handleExpand = useCallback(
    (id: string) => {
      setExpandedSession(id);
    },
    [setExpandedSession],
  );

  const handleCloseExpanded = useCallback(() => {
    setExpandedSession(null);
  }, [setExpandedSession]);

  return (
    <div className="flex flex-col" style={{ height: "100vh", background: "var(--color-bg-base)" }}>
      {/* Expanded session overlay (Phase 3) */}
      <ExpandedSession sessionId={expandedSessionId} onClose={handleCloseExpanded} />

      {/* New Session modal (Phase 4) */}
      <NewSessionModal open={newSessionOpen} onClose={handleCloseNewSession} />

      <Header onMenuToggle={() => setMobileSidebarOpen(true)} />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {/* Mobile sidebar overlay backdrop */}
          {mobileSidebarOpen && (
            <div
              className="md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 40,
                background: "rgba(0,0,0,0.4)",
              }}
            />
          )}

          {/* Left sidebar — relative on desktop, fixed overlay on mobile */}
          <aside
            className={[
              "companion-sidebar flex flex-col flex-shrink-0 overflow-hidden",
              // Mobile: fixed overlay; desktop: static in flex flow
              "fixed md:static",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
              "transition-transform duration-200 ease-in-out",
              // Mobile z-index handled via CSS class
              "mobile-sidebar-overlay",
            ].join(" ")}
            style={{
              width: 260,
              background: "var(--color-bg-sidebar)",
              boxShadow: "1px 0 4px rgba(0,0,0,0.03)",
            }}
            aria-label="Session sidebar"
          >
            {/* Mobile close button */}
            <div
              className="md:hidden flex items-center justify-between px-4 py-2"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Sessions
              </span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2 rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                style={{ color: "var(--color-text-muted)" }}
                aria-label="Close sidebar"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <SessionManagementBar />
            <div className="flex-1 overflow-hidden">
              <SessionList
                sessions={sessionList}
                activeSessionId={activeSessionId}
                onSelect={(id) => {
                  handleSelectSession(id);
                  setMobileSidebarOpen(false);
                }}
                onNew={() => {
                  handleNewSession();
                  setMobileSidebarOpen(false);
                }}
              />
            </div>
            <ApiKeyIndicator />
          </aside>

          {/* Corner arc SVG — concave curve where sidebar meets content (desktop only) */}
          <div
            className="hidden md:block companion-corner-arc"
            style={{ position: "relative", width: 0, height: 0, flexShrink: 0 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              style={{ position: "absolute", top: 0, left: 0 }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="corner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4285F4" />
                  <stop offset="33%" stopColor="#EA4335" />
                  <stop offset="66%" stopColor="#FBBC04" />
                  <stop offset="100%" stopColor="#34A853" />
                </linearGradient>
              </defs>
              {/* Fill: sidebar bg covers the square, quadratic curve reveals main bg */}
              <path d="M 0 0 L 16 0 Q 0 0 0 16 L 0 0 Z" fill="var(--color-bg-sidebar)" />
              {/* Subtle gradient arc */}
              <path d="M 16 0 Q 0 0 0 16" fill="none" stroke="url(#corner-grad)" strokeWidth="2" />
            </svg>
          </div>

          {/* Main grid area */}
          <main
            className="flex flex-col flex-1 min-w-0 overflow-hidden"
            style={{
              background: "var(--color-bg-base)",
            }}
          >
            {/* Resume banner */}
            {!resumeBannerDismissed && resumableSessions.length > 0 && (
              <ResumeBanner
                sessions={resumableSessions}
                onResume={handleResume}
                onDismissOne={async (id) => {
                  try {
                    await api.sessions.dismissResumable(id);
                    setResumableSessions((prev) => prev.filter((s) => s.id !== id));
                  } catch {
                    // ignore
                  }
                }}
                onDismiss={() => setResumeBannerDismissed(true)}
              />
            )}
            <MultiSessionLayout
              gridSessions={gridSessions}
              onExpand={handleExpand}
              emptyState={<EmptyCenter />}
            />
          </main>

          {/* Right panel — File Explorer, Browser Preview, or Search (desktop only, hidden on mobile to save space) */}
          {rightPanelMode !== "none" && (
            <aside
              className="hidden md:flex flex-col flex-shrink-0 overflow-hidden"
              style={{
                width:
                  rightPanelMode === "browser"
                    ? 600
                    : rightPanelMode === "terminal"
                      ? 600
                      : rightPanelMode === "stats"
                        ? 360
                        : rightPanelMode === "ai-context"
                          ? 420
                          : 500,
                borderLeft: "1px solid var(--color-border)",
                transition: "width 200ms ease",
              }}
            >
              {rightPanelMode === "files" && (
                <FileExplorerPanel
                  initialPath={rightPanelPath ?? undefined}
                  onClose={() => setRightPanelMode("none")}
                />
              )}
              {rightPanelMode === "browser" && (
                <BrowserPreviewPanel
                  initialUrl={browserPreviewUrl ?? undefined}
                  onClose={() => setRightPanelMode("none")}
                />
              )}
              {rightPanelMode === "search" && (
                <SearchPanel
                  searchRoot={rightPanelPath ?? ""}
                  onOpenFile={(path) => {
                    setRightPanelMode("files");
                    setRightPanelPath(path);
                  }}
                  onClose={() => setRightPanelMode("none")}
                />
              )}
              {rightPanelMode === "terminal" && (
                <TerminalPanel onClose={() => setRightPanelMode("none")} />
              )}
              {rightPanelMode === "stats" && (
                <StatsPanel onClose={() => setRightPanelMode("none")} />
              )}
              {rightPanelMode === "ai-context" && (
                <AiContextPanel
                  onClose={() => setRightPanelMode("none")}
                  projectSlug={
                    activeSessionId
                      ? (sessions[activeSessionId]?.projectSlug ?? undefined)
                      : undefined
                  }
                />
              )}
            </aside>
          )}
        </div>

        {/* Activity Terminal — collapsible bottom panel */}
        <ActivityTerminal
          open={activityTerminalOpen}
          onToggle={() => setActivityTerminalOpen(!activityTerminalOpen)}
        />
      </div>

      {/* Magic Ring — floating shared context hub */}
      <MagicRing />

      {/* First-run onboarding wizard */}
      <OnboardingWizard onOpenNewSession={handleNewSession} />
    </div>
  );
}
