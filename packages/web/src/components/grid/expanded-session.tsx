"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "@/lib/z-index";
import {
  ArrowsIn,
  X,
  Circle,
  Info,
  ChatTeardropDots,
  DownloadSimple,
  CaretDown,
  Check,
  Plus,
  TelegramLogo,
} from "@phosphor-icons/react";
import { useSession } from "@/hooks/use-session";
import { useSessionStore } from "@/lib/stores/session-store";
import { useAnimatePresence } from "@/lib/animation";
import { MessageFeed } from "@/components/session/message-feed";
import { MessageComposer } from "@/components/session/message-composer";
import { PermissionGate } from "@/components/session/permission-gate";
import { ContextMeter } from "@/components/session/context-meter";
import { SessionDetails } from "@/components/session/session-details";
import { ChannelPanel } from "@/components/shared/channel-panel";
import { PulseWarning } from "@/components/pulse/pulse-warning";
import { AgentTabBar } from "./agent-tab-bar";
import { SpawnAgentModal } from "@/components/session/spawn-agent-modal";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { getStatusColor } from "@/components/ui/status-badge";

// ── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = getStatusColor(status);
  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      <Circle
        size={6}
        weight="fill"
        style={{
          animation:
            status === "running" || status === "busy" ? "blink 1.2s step-end infinite" : undefined,
        }}
      />
      {status}
    </span>
  );
}

// ── Focus trap helper ───────────────────────────────────────────────────────

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.closest("[aria-hidden='true']"));
}

function trapFocus(container: HTMLElement, e: KeyboardEvent) {
  const focusable = getFocusable(container);
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;

  if (e.key === "Tab") {
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

// ── Model Switcher for expanded view ────────────────────────────────────────

const MODEL_OPTIONS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", emoji: "🧠", desc: "Deep reasoning" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", emoji: "🎯", desc: "Fast & capable" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", emoji: "⚡", desc: "Quick tasks" },
] as const;

function ExpandedModelSwitcher({
  model,
  onSetModel,
  isActive,
}: {
  model: string;
  onSetModel: (model: string) => void;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const modelName = model.includes("/") ? model.split("/").pop()! : model;
  const modelShort = modelName.includes("opus")
    ? "Opus"
    : modelName.includes("haiku")
      ? "Haiku"
      : modelName.includes("sonnet")
        ? "Sonnet"
        : modelName;

  return (
    <div ref={ref} className="relative hidden sm:block flex-shrink-0">
      <button
        onClick={() => isActive && setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium transition-colors cursor-pointer"
        style={{
          background: open ? "var(--color-accent)" : "var(--color-bg-elevated)",
          color: open ? "#fff" : "var(--color-text-secondary)",
          border: open ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
        }}
        title={isActive ? "Click to switch model" : model}
        aria-label="Switch model"
      >
        {modelShort}
        {isActive && <CaretDown size={10} weight="bold" />}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: Z.popover,
            background: "var(--glass-bg-heavy)",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-float)",
            minWidth: 200,
            padding: "4px",
            animation: "slideUpFade 150ms ease forwards",
          }}
        >
          {MODEL_OPTIONS.map((opt) => {
            const isCurrent = modelName.includes(opt.id.replace("claude-", "").split("-")[0]!);
            return (
              <button
                key={opt.id}
                onClick={() => {
                  onSetModel(opt.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs rounded-md transition-colors cursor-pointer"
                style={{
                  background: isCurrent
                    ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                    : "transparent",
                  color: isCurrent ? "var(--color-accent)" : "var(--color-text-primary)",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) e.currentTarget.style.background = "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{opt.emoji}</span>
                <span className="font-semibold">{opt.label}</span>
                <span style={{ color: "var(--color-text-muted)" }}>{opt.desc}</span>
                {isCurrent && (
                  <Check
                    size={12}
                    weight="bold"
                    className="ml-auto"
                    style={{ color: "var(--color-accent)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Expanded session overlay ────────────────────────────────────────────────

interface ExpandedSessionProps {
  sessionId: string;
  onClose: () => void;
}

type SidebarTab = "details" | "context";

function ExpandedSessionInner({ sessionId, onClose }: ExpandedSessionProps) {
  const [activeTab, setActiveTab] = useState(sessionId);
  const [spawnOpen, setSpawnOpen] = useState(false);

  const parentHook = useSession(sessionId);
  const childHook = useSession(activeTab !== sessionId ? activeTab : "");
  const activeHook = activeTab === sessionId ? parentHook : childHook;
  const { messages, pendingPermissions, wsStatus, sendMessage, respondPermission, setModel } =
    activeHook;

  const session = useSessionStore((s) => s.sessions[sessionId]);
  const childIds = useSessionStore((s) => s.sessions[sessionId]?.childSessionIds);
  const isRunning = session?.status === "running" || session?.status === "busy";
  const hasChildren = !!childIds && childIds.length > 0;

  const overlayRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("details");
  const [channelId, setChannelId] = useState<string | null | undefined>(undefined);

  // Auto-focus composer textarea on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const textarea = composerRef.current?.querySelector("textarea");
      textarea?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  // Esc to close + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (overlayRef.current) {
        trapFocus(overlayRef.current, e);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Fetch channelId from session record
  useEffect(() => {
    api.sessions
      .get(sessionId)
      .then((res) => {
        const record = res.data as { channelId?: string | null };
        setChannelId(record.channelId ?? null);
      })
      .catch(() => setChannelId(null));
  }, [sessionId]);

  const handleStop = useCallback(async () => {
    const s = useSessionStore.getState().sessions[sessionId];
    const confirmed = window.confirm(
      `Stop session "${s?.projectName || s?.shortId || sessionId.slice(0, 8)}"?\n\nThis will terminate the running agent.`,
    );
    if (!confirmed) return;

    try {
      await api.sessions.stop(sessionId);
      toast.success("Session stopped");
    } catch {
      toast.error("Failed to stop session");
    }
  }, [sessionId]);

  const handleExport = useCallback(() => {
    const apiKey = typeof window !== "undefined" ? (localStorage.getItem("api_key") ?? "") : "";
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    const url = `${base}/api/sessions/${sessionId}/export?format=md`;
    // Use anchor click to trigger browser download
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `session-${sessionId.slice(0, 8)}.md`;
    if (apiKey) anchor.href = url + `&key=${encodeURIComponent(apiKey)}`;
    // Fetch with auth header since we can't set headers on <a> tag
    fetch(url, { headers: { "X-API-Key": apiKey } })
      .then((res) => res.blob())
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        anchor.href = objectUrl;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
        toast.success("Session exported");
      })
      .catch(() => toast.error("Export failed"));
  }, [sessionId]);

  const cost = session?.state?.total_cost_usd ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="glass-backdrop-enter glass-backdrop-enter-active"
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.popover,
          background: "rgba(0,0,0,0.5)",
        }}
      />

      {/* Card */}
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Expanded session: ${session?.projectName ?? sessionId}`}
        className="glass-enter glass-enter-active"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.expanded,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Desktop: padded container. Mobile: full screen (handled by inner div)
          padding: "5vh 5vw",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 1200,
            height: "100%",
            maxHeight: "90vh",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
            /* Light mode glass */
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}
          className="dark:bg-glass-dark expanded-session-card"
        >
          {/* ── Header ── */}
          <div
            className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            {/* Project name + typing status */}
            <h2
              className="text-base font-semibold truncate flex-1 flex items-center gap-2"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-text-primary)",
              }}
            >
              {session?.projectName ?? sessionId}
              {session?.state?.source === "telegram" && (
                <TelegramLogo
                  size={16}
                  weight="fill"
                  style={{ color: "#2AABEE", flexShrink: 0 }}
                  aria-label="Telegram session"
                />
              )}
              {isRunning && (
                <span
                  className="text-xs font-normal flex-shrink-0"
                  style={{
                    color: "var(--color-accent)",
                    fontFamily: "var(--font-body)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                >
                  typing…
                </span>
              )}
            </h2>

            {/* Model switcher dropdown — hidden on mobile */}
            <ExpandedModelSwitcher
              model={session?.model ?? ""}
              onSetModel={setModel}
              isActive={!["ended", "error"].includes(session?.status ?? "idle")}
            />

            {/* Status */}
            <StatusBadge status={session?.status ?? "idle"} />

            {/* Cost — hidden on mobile */}
            <span className="hidden sm:inline text-xs font-mono font-semibold flex-shrink-0">
              ${cost.toFixed(4)}
            </span>

            {/* WS status dot */}
            {wsStatus !== "connected" && (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                style={{
                  background: wsStatus === "connecting" ? "#FBBC0420" : "#EA433520",
                  color: wsStatus === "connecting" ? "var(--color-warning)" : "var(--color-danger)",
                }}
              >
                {wsStatus === "connecting" ? "…" : "!"}
              </span>
            )}

            {/* Export button — desktop only */}
            {/* Spawn agent button */}
            <button
              onClick={() => setSpawnOpen(true)}
              className="hidden sm:flex flex-shrink-0 p-2 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] items-center justify-center"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
              }}
              aria-label="Spawn new agent"
              title="Spawn new agent"
            >
              <Plus size={16} weight="bold" />
            </button>

            <button
              onClick={handleExport}
              className="hidden sm:flex flex-shrink-0 p-2 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] items-center justify-center"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
              }}
              aria-label="Export session as markdown"
              title="Export session as markdown"
            >
              <DownloadSimple size={16} weight="bold" />
            </button>

            {/* Collapse button — desktop only (same as close on mobile) */}
            <button
              onClick={onClose}
              className="hidden sm:flex flex-shrink-0 p-2 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] items-center justify-center"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
              }}
              aria-label="Collapse session"
            >
              <ArrowsIn size={16} weight="bold" />
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="flex-shrink-0 p-2 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
              }}
              aria-label="Close expanded view"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          {/* ── Context meter ── */}
          <div className="flex-shrink-0">
            <ContextMeter
              inputTokens={session?.state?.total_input_tokens ?? 0}
              outputTokens={session?.state?.total_output_tokens ?? 0}
            />
          </div>

          {/* ── Agent tab bar (multi-brain) — only when children exist ── */}
          {hasChildren && (
            <AgentTabBar
              parentSessionId={sessionId}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onSpawnClick={() => setSpawnOpen(true)}
              onCloseTab={async (childId) => {
                try {
                  await api.sessions.stop(childId);
                } catch {
                  // already ended
                }
                useSessionStore.getState().removeChildSession(sessionId, childId);
                if (activeTab === childId) setActiveTab(sessionId);
              }}
            />
          )}

          {/* ── Body: message area + sidebar ── */}
          <div className="flex flex-1 min-h-0">
            {/* Left: message feed + permissions + composer */}
            <div className="flex flex-col flex-1 min-w-0">
              {/* Pulse warning — agent health alert with action buttons */}
              <PulseWarning sessionId={sessionId} onSendMessage={sendMessage} onStop={handleStop} />

              {/* Message feed with Telegram watermark */}
              <div className="flex-1 min-h-0 relative">
                {session?.state?.source === "telegram" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                      zIndex: Z.base,
                    }}
                  >
                    <TelegramLogo
                      size={200}
                      weight="thin"
                      style={{ color: "var(--color-text-muted)", opacity: 0.04 }}
                    />
                  </div>
                )}
                <div className="h-full overflow-y-auto">
                  <MessageFeed messages={messages} sessionId={sessionId} />
                </div>
              </div>

              {/* Permissions */}
              <div className="flex-shrink-0">
                <PermissionGate permissions={pendingPermissions} onRespond={respondPermission} />
              </div>

              {/* Composer */}
              <div ref={composerRef} className="flex-shrink-0">
                <MessageComposer
                  onSend={sendMessage}
                  onStop={handleStop}
                  isRunning={isRunning}
                  projectSlug={session?.projectSlug ?? undefined}
                  placeholder="Message Claude… (Enter to send, Shift+Enter for newline, Ctrl+Enter also sends)"
                />
              </div>
            </div>

            {/* Right sidebar — hidden on mobile */}
            <aside
              className="hidden sm:flex flex-shrink-0 flex-col min-h-0"
              style={{
                width: 280,
                borderLeft: "1px solid var(--color-border)",
              }}
            >
              {/* Sidebar tab bar */}
              <div
                className="flex flex-shrink-0"
                style={{ borderBottom: "1px solid var(--color-border)" }}
                role="tablist"
                aria-label="Session sidebar tabs"
              >
                <button
                  role="tab"
                  aria-selected={sidebarTab === "details"}
                  onClick={() => setSidebarTab("details")}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium cursor-pointer transition-colors flex-1 justify-center"
                  style={{
                    color:
                      sidebarTab === "details" ? "var(--color-accent)" : "var(--color-text-muted)",
                    borderBottom:
                      sidebarTab === "details" ? "2px solid #4285F4" : "2px solid transparent",
                    background: "transparent",
                  }}
                >
                  <Info size={13} aria-hidden="true" />
                  Details
                </button>
                <button
                  role="tab"
                  aria-selected={sidebarTab === "context"}
                  onClick={() => setSidebarTab("context")}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium cursor-pointer transition-colors flex-1 justify-center"
                  style={{
                    color:
                      sidebarTab === "context" ? "var(--color-accent)" : "var(--color-text-muted)",
                    borderBottom:
                      sidebarTab === "context" ? "2px solid #4285F4" : "2px solid transparent",
                    background: "transparent",
                  }}
                >
                  <ChatTeardropDots size={13} aria-hidden="true" />
                  Context
                  {channelId && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: "var(--color-accent)" }}
                      aria-label="Channel active"
                    />
                  )}
                </button>
              </div>

              {/* Tab panels */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {sidebarTab === "details" && (
                  <SessionDetails
                    session={
                      session
                        ? {
                            id: session.id,
                            projectName: session.projectName,
                            model: session.model,
                            status: session.status,
                            state: {
                              total_cost_usd: session.state?.total_cost_usd ?? 0,
                              num_turns: session.state?.num_turns ?? 0,
                              total_input_tokens: session.state?.total_input_tokens ?? 0,
                              total_output_tokens: session.state?.total_output_tokens ?? 0,
                              cache_read_tokens: session.state?.cache_read_tokens ?? 0,
                              files_read: session.state?.files_read ?? [],
                              files_modified: session.state?.files_modified ?? [],
                              files_created: session.state?.files_created ?? [],
                              started_at: session.state?.started_at ?? 0,
                              cwd: session.state?.cwd,
                            },
                          }
                        : null
                    }
                  />
                )}
                {sidebarTab === "context" && (
                  <ChannelPanel
                    sessionId={sessionId}
                    channelId={channelId}
                    projectSlug={session?.projectSlug}
                    onChannelChange={setChannelId}
                  />
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Spawn agent modal */}
      <SpawnAgentModal
        parentSessionId={sessionId}
        parentModel={session?.model ?? "claude-sonnet-4-6"}
        open={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        onSpawned={(childSessionId, childShortId, name, role) => {
          const store = useSessionStore.getState();
          store.setSession(childSessionId, {
            id: childSessionId,
            shortId: childShortId,
            projectSlug: session?.projectSlug ?? "",
            projectName: name,
            model: session?.model ?? "claude-sonnet-4-6",
            status: "starting",
            state: {} as import("@companion/shared").SessionState,
            createdAt: Date.now(),
            parentSessionId: sessionId,
            brainRole: role as "specialist" | "researcher" | "reviewer",
            agentName: name,
          });
          store.addChildSession(sessionId, childSessionId);
        }}
      />
    </>
  );
}

// ── Public component with portal + animate-presence ─────────────────────────

interface ExpandedSessionProps2 {
  sessionId: string | null;
  onClose: () => void;
}

export function ExpandedSession({ sessionId, onClose }: ExpandedSessionProps2) {
  const { shouldRender, animationState } = useAnimatePresence(!!sessionId);
  const [mounted, setMounted] = useState(false);

  // Ensure we're in the browser before creating portal
  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- SSR portal guard
  }, []);

  if (!mounted || !shouldRender || !sessionId) return null;

  // animationState drives CSS — the classes are applied via the inner component
  void animationState; // consumed via CSS class names in ExpandedSessionInner

  return createPortal(
    <ExpandedSessionInner sessionId={sessionId} onClose={onClose} />,
    document.body,
  );
}
