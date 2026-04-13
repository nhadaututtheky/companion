"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  PushPin,
  TelegramLogo,
  PencilSimple,
  ShieldWarning,
  ShareNetwork,
  Users,
  ClockCounterClockwise,
  TerminalWindow,
  PaintBrush,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { MessageFeed } from "@/components/session/message-feed";
import { MessageComposer } from "@/components/session/message-composer";
import { PermissionGate } from "@/components/session/permission-gate";
import { SessionDetails } from "@/components/session/session-details";
import { PinnedMessagesDrawer } from "@/components/session/pinned-messages-drawer";
import { ShareModal } from "@/components/session/share-modal";
import { PromptHistoryPanel } from "@/components/panels/prompt-history-panel";
import { Z } from "@/lib/z-index";
import { ModelSelector } from "@/components/session/model-selector";
import { ThinkingModeSelector } from "@/components/session/thinking-mode-selector";
import { PersonaChip } from "@/components/persona/persona-chip";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import { TipBanner } from "@/components/tips/tip-banner";
import { usePinnedMessagesStore } from "@/lib/stores/pinned-messages-store";
import { usePreviewStore } from "@/lib/stores/preview-store";
import { useSession } from "@/hooks/use-session";
import { useArtifactExtractor } from "@/hooks/use-artifact-extractor";
import { useSessionStore } from "@/lib/stores/session-store";
import { useDebateStore } from "@/lib/stores/debate-store";
import type { ModelInfo } from "@/components/session/model-bar";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

const DesignPreviewPanel = dynamic(
  () =>
    import("@/components/panels/design-preview-panel").then((m) => ({
      default: m.DesignPreviewPanel,
    })),
  { ssr: false },
);

const TerminalPanel = dynamic(
  () => import("@/components/panels/terminal-panel").then((m) => ({ default: m.TerminalPanel })),
  { ssr: false },
);

const EMPTY_PARTICIPANTS: ModelInfo[] = [];

interface PageProps {
  params: Promise<{ id: string }>;
}

function ContextStatusBar({
  session,
}: {
  session:
    | {
        state?: Partial<import("@companion/shared").SessionState>;
        contextUsedPercent?: number;
        contextTokens?: number;
        contextMaxTokens?: number;
      }
    | undefined;
}) {
  if (!session?.state) return null;

  // Prefer real-time context data from CLI polling when available
  const hasRealtimeContext =
    session.contextTokens !== undefined && session.contextMaxTokens !== undefined;

  const {
    total_input_tokens = 0,
    total_output_tokens = 0,
    cache_read_tokens = 0,
    model = "",
  } = session.state;
  const fallbackTotal = total_input_tokens + total_output_tokens + cache_read_tokens;

  const totalTokens = hasRealtimeContext ? session.contextTokens! : fallbackTotal;
  const maxTokens = hasRealtimeContext
    ? session.contextMaxTokens!
    : model.includes("haiku")
      ? 200_000
      : 1_000_000;

  if (totalTokens === 0) return null;

  const pct = hasRealtimeContext
    ? (session.contextUsedPercent ?? 0)
    : Math.min(100, (totalTokens / maxTokens) * 100);
  const remaining = maxTokens - totalTokens;

  const color = pct < 60 ? "#34A853" : pct < 85 ? "#FBBC04" : "#EA4335";

  const formatK = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  };

  return (
    <div
      className="bg-bg-card flex items-center gap-3 px-4 py-1.5"
      style={{
        boxShadow: "0 1px 0 var(--color-border)",
      }}
    >
      {/* Progress bar */}
      <div
        className="bg-bg-elevated flex-1 overflow-hidden rounded-full"
        style={{ height: 3, maxWidth: 120 }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      {/* Text info */}
      <span className="font-mono text-xs" style={{ color }}>
        {pct.toFixed(0)}%
      </span>
      <span className="font-mono text-xs">
        {formatK(totalTokens)} / {formatK(maxTokens)}
      </span>
      <span className="text-xs">· {formatK(remaining)} remaining</span>
    </div>
  );
}

function TelegramStreamBadge({ sessionId }: { sessionId: string }) {
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      api.sessions
        .streamTelegramStatus(sessionId)
        .then((res) => {
          if (!cancelled) setStreaming(res.data.streaming);
        })
        .catch(() => {});
    };

    check();
    const interval = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  if (!streaming) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={{ background: "#29B6F615", color: "#29B6F6" }}
      title="Streaming to Telegram"
    >
      <TelegramLogo size={12} weight="fill" aria-hidden="true" />
      Live
    </span>
  );
}

export function SessionPageClient({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const {
    messages,
    pendingPermissions,
    wsStatus,
    lockStatus,
    lastScanResult,
    spectatorCount,
    sendMessage,
    respondPermission,
    setModel,
    setThinkingMode,
  } = useSession(id);
  const session = useSessionStore((s) => s.sessions[id]);
  const debateParticipants = useDebateStore((s) => s.participants[id] ?? EMPTY_PARTICIPANTS);
  const addDebateParticipant = useDebateStore((s) => s.addParticipant);
  const removeDebateParticipant = useDebateStore((s) => s.removeParticipant);
  const [pinnedDrawerOpen, setPinnedDrawerOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [promptHistoryOpen, setPromptHistoryOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Artifact extraction + preview panel
  useArtifactExtractor(messages);
  const previewPanelOpen = usePreviewStore((s) => s.panelOpen);
  const previewArtifactCount = usePreviewStore((s) => s.artifacts.length);
  const openPreviewPanel = usePreviewStore((s) => s.openPanel);
  const clearPreviewArtifacts = usePreviewStore((s) => s.clearArtifacts);

  const handlePersonaSwitch = useCallback(
    async (personaId: string | null) => {
      try {
        await api.sessions.switchPersona(id, personaId);
        useSessionStore.getState().setSession(id, { personaId: personaId ?? undefined });
        toast.success(personaId ? "Persona switched" : "Persona cleared");
      } catch {
        toast.error("Failed to switch persona");
      }
    },
    [id],
  );
  const scrollToMessageRef = useRef<((index: number) => void) | null>(null);
  const getPins = usePinnedMessagesStore((s) => s.getPins);
  const pinCount = getPins(id).length;

  const toggleTerminal = useCallback(() => setTerminalOpen((v) => !v), []);

  // Clear preview artifacts when leaving session
  useEffect(() => {
    return () => clearPreviewArtifacts();
  }, [clearPreviewArtifacts]);

  // Ctrl+` keyboard shortcut for terminal toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        toggleTerminal();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTerminal]);

  const handleStop = async () => {
    try {
      await api.sessions.stop(id);
      toast.success("Session stopped");
    } catch {
      toast.error("Failed to stop session");
    }
  };

  const handleJumpTo = (index: number) => {
    scrollToMessageRef.current?.(index);
  };

  const handleScrollToRef = (fn: (index: number) => void) => {
    scrollToMessageRef.current = fn;
  };

  return (
    <div className="session-slide-container" data-preview-open={previewPanelOpen || undefined}>
      {/* ── Chat Page (slides left when preview opens) ── */}
      <div className="session-slide-page session-slide-chat">
        <div className="bg-bg-base flex flex-col" style={{ height: "100vh" }}>
          <Header />

          <div className="flex flex-1 overflow-hidden">
            {/* Main terminal */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Sub-header */}
              <div
                className="bg-bg-card flex items-center gap-3 border-b px-4 py-2.5"
                style={{
                  borderColor: "var(--color-border)",
                }}
              >
                <button
                  onClick={() => router.back()}
                  className="cursor-pointer rounded-lg p-1.5 transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft size={16} weight="bold" />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {session?.projectName ?? id.slice(0, 8)}
                  </span>
                  <span className="font-mono text-xs">#{id.slice(0, 8)}</span>
                  <TelegramStreamBadge sessionId={id} />
                  {lockStatus.locked && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                      style={{ background: "#FBBC0420", color: "#FBBC04" }}
                      title={`Writing: ${lockStatus.owner}${lockStatus.queueSize > 0 ? ` (${lockStatus.queueSize} queued)` : ""}`}
                    >
                      <PencilSimple size={12} weight="bold" aria-hidden="true" />
                      Writing...
                    </span>
                  )}
                  {lastScanResult && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: lastScanResult.blocked ? "#EF444420" : "#F59E0B20",
                        color: lastScanResult.blocked ? "#EF4444" : "#F59E0B",
                      }}
                      title={lastScanResult.risks
                        .map((r) => `[${r.severity}] ${r.description}`)
                        .join("\n")}
                    >
                      <ShieldWarning size={12} weight="bold" aria-hidden="true" />
                      {lastScanResult.blocked
                        ? "Blocked"
                        : `${lastScanResult.risks.length} risk${lastScanResult.risks.length > 1 ? "s" : ""}`}
                    </span>
                  )}
                  {spectatorCount > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                      style={{ background: "#4285f420", color: "#4285f4" }}
                      title={`${spectatorCount} spectator${spectatorCount > 1 ? "s" : ""} watching`}
                    >
                      <Users size={12} weight="bold" aria-hidden="true" />
                      {spectatorCount}
                    </span>
                  )}
                  <button
                    onClick={() => setShareModalOpen(true)}
                    className="text-text-muted border-border inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors hover:bg-[var(--color-bg-elevated)]"
                    aria-label="Share session"
                    title="Share session"
                  >
                    <ShareNetwork size={12} weight="bold" aria-hidden="true" />
                    Share
                  </button>
                </div>

                {/* Mid-session model + thinking mode + persona selectors */}
                {session?.status !== "ended" && session?.status !== "error" && (
                  <>
                    <ModelSelector
                      currentModel={session?.model ?? "claude-sonnet-4-6"}
                      onModelChange={setModel}
                      disabled={session?.status === "starting"}
                    />
                    <ThinkingModeSelector
                      currentMode={session?.state?.thinking_mode ?? "adaptive"}
                      onModeChange={setThinkingMode}
                      disabled={session?.status === "starting"}
                    />
                    {session?.personaId && (
                      <PersonaChip
                        personaId={session.personaId}
                        onSwitch={handlePersonaSwitch}
                        disabled={session?.status === "starting"}
                      />
                    )}
                  </>
                )}

                {wsStatus !== "connected" && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      background: wsStatus === "connecting" ? "#FBBC0420" : "#EA433520",
                      color: wsStatus === "connecting" ? "#FBBC04" : "#EA4335",
                    }}
                  >
                    {wsStatus}
                  </span>
                )}

                {/* Design Preview toggle — always visible */}
                <button
                  onClick={() => openPreviewPanel()}
                  className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    color: previewArtifactCount > 0 ? "#a855f7" : "var(--color-text-muted)",
                    background: previewArtifactCount > 0 ? "#a855f710" : "transparent",
                    border: `1px solid ${previewArtifactCount > 0 ? "#a855f730" : "var(--color-border)"}`,
                  }}
                  aria-label="Open design preview"
                  title="Open design preview"
                >
                  <PaintBrush size={14} weight="bold" />
                  Preview
                  {previewArtifactCount > 0 && (
                    <span
                      className="rounded-full px-1 text-center font-mono font-bold leading-tight"
                      style={{
                        background: "#a855f7",
                        color: "#fff",
                        fontSize: 9,
                        minWidth: 16,
                      }}
                    >
                      {previewArtifactCount}
                    </span>
                  )}
                </button>

                {/* Terminal toggle */}
                <button
                  onClick={toggleTerminal}
                  className="cursor-pointer rounded-lg p-1.5 transition-colors"
                  style={{
                    color: terminalOpen ? "#34A853" : "var(--color-text-muted)",
                    background: terminalOpen ? "#34A85310" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!terminalOpen)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--color-bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    if (!terminalOpen)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  aria-label="Toggle terminal (Ctrl+`)"
                  title="Toggle terminal (Ctrl+`)"
                >
                  <TerminalWindow size={16} weight={terminalOpen ? "fill" : "bold"} />
                </button>

                {/* Prompt history toggle */}
                <button
                  onClick={() => setPromptHistoryOpen(true)}
                  className="cursor-pointer rounded-lg p-1.5 transition-colors"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  aria-label="Prompt history"
                  title="Prompt history"
                >
                  <ClockCounterClockwise size={16} weight="bold" />
                </button>

                {/* Pinned messages toggle */}
                <button
                  onClick={() => setPinnedDrawerOpen(true)}
                  className="relative cursor-pointer rounded-lg p-1.5 transition-colors"
                  style={{ color: pinCount > 0 ? "#FBBC04" : "var(--color-text-muted)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  aria-label={`Pinned messages${pinCount > 0 ? ` (${pinCount})` : ""}`}
                  title="Pinned messages"
                >
                  <PushPin size={16} weight={pinCount > 0 ? "fill" : "bold"} />
                  {pinCount > 0 && (
                    <span
                      className="absolute -right-0.5 -top-0.5 rounded-full px-1 text-center font-mono text-xs font-bold leading-tight"
                      style={{
                        background: "#FBBC04",
                        color: "#000",
                        fontSize: 9,
                        minWidth: 14,
                      }}
                    >
                      {pinCount}
                    </span>
                  )}
                </button>
              </div>

              <ContextStatusBar session={session} />

              {/* Tip */}
              {messages.length === 0 && (
                <div className="px-3 pt-2">
                  <TipBanner context="session" />
                </div>
              )}

              {/* Messages */}
              <PanelErrorBoundary name="Message Feed">
                <MessageFeed messages={messages} sessionId={id} onScrollToRef={handleScrollToRef} />
              </PanelErrorBoundary>

              {/* Terminal panel — collapsible bottom section */}
              {terminalOpen && (
                <div
                  className="shrink-0"
                  style={{
                    height: 240,
                    minHeight: 120,
                    boxShadow: "0 -1px 0 var(--color-border)",
                  }}
                >
                  <PanelErrorBoundary name="Terminal">
                    <TerminalPanel defaultCwd={session?.state?.cwd} onClose={toggleTerminal} />
                  </PanelErrorBoundary>
                </div>
              )}

              <PermissionGate permissions={pendingPermissions} onRespond={respondPermission} />
              <MessageComposer
                onSend={sendMessage}
                onStop={handleStop}
                isRunning={session?.status === "running"}
                projectSlug={session?.projectSlug ?? undefined}
                sessionModel={session?.model}
                debateParticipants={debateParticipants}
                onAddDebateParticipant={(model) => addDebateParticipant(id, model)}
                onRemoveDebateParticipant={(modelId) => removeDebateParticipant(id, modelId)}
              />
            </div>

            {/* Right panel */}
            <aside
              className="bg-bg-sidebar flex flex-shrink-0 flex-col overflow-y-auto border-l"
              style={{
                width: 300,
                borderColor: "var(--color-border)",
              }}
            >
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <SessionDetails session={session as any} messages={messages as any} />
            </aside>
          </div>

          {/* Pinned messages drawer */}
          {pinnedDrawerOpen && (
            <PinnedMessagesDrawer
              sessionId={id}
              messages={messages}
              onJumpTo={handleJumpTo}
              onClose={() => setPinnedDrawerOpen(false)}
            />
          )}
          {shareModalOpen && <ShareModal sessionId={id} onClose={() => setShareModalOpen(false)} />}
          {promptHistoryOpen && (
            <div
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: 400,
                zIndex: Z.popover,
                boxShadow: "-4px 0 24px rgba(0,0,0,0.2)",
              }}
            >
              <PromptHistoryPanel
                sessionId={id}
                onResend={(content) => {
                  sendMessage(content);
                  setPromptHistoryOpen(false);
                }}
                onClose={() => setPromptHistoryOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
      {/* close session-slide-chat */}

      {/* ── Design Preview Page (slides in from right) ── */}
      <div className="session-slide-page session-slide-preview">
        <PanelErrorBoundary name="Design Preview">
          <DesignPreviewPanel />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}
