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
import { ModelSelector } from "@/components/session/model-selector";
import { ThinkingModeSelector } from "@/components/session/thinking-mode-selector";
import { usePinnedMessagesStore } from "@/lib/stores/pinned-messages-store";
import { useSession } from "@/hooks/use-session";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

const TerminalPanel = dynamic(
  () => import("@/components/panels/terminal-panel").then((m) => ({ default: m.TerminalPanel })),
  { ssr: false },
);

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
      className="flex items-center gap-3 px-4 py-1.5"
      style={{
        background: "var(--color-bg-card)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Progress bar */}
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: 3, background: "var(--color-bg-elevated)", maxWidth: 120 }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      {/* Text info */}
      <span className="text-xs font-mono" style={{ color }}>
        {pct.toFixed(0)}%
      </span>
      <span className="text-xs font-mono">
        {formatK(totalTokens)} / {formatK(maxTokens)}
      </span>
      <span className="text-xs">
        · {formatK(remaining)} remaining
      </span>
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
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
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
  const [pinnedDrawerOpen, setPinnedDrawerOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [promptHistoryOpen, setPromptHistoryOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const scrollToMessageRef = useRef<((index: number) => void) | null>(null);
  const getPins = usePinnedMessagesStore((s) => s.getPins);
  const pinCount = getPins(id).length;

  const toggleTerminal = useCallback(() => setTerminalOpen((v) => !v), []);

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
    <div className="flex flex-col" style={{ height: "100vh", background: "var(--color-bg-base)" }}>
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {/* Main terminal */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Sub-header */}
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-b"
            style={{
              background: "var(--color-bg-card)",
              borderColor: "var(--color-border)",
            }}
          >
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg transition-colors cursor-pointer"
             
              aria-label="Back"
            >
              <ArrowLeft size={16} weight="bold" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className="text-sm font-semibold truncate"
               
              >
                {session?.projectName ?? id.slice(0, 8)}
              </span>
              <span className="text-xs font-mono">
                #{id.slice(0, 8)}
              </span>
              <TelegramStreamBadge sessionId={id} />
              {lockStatus.locked && (
                <span
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "#FBBC0420", color: "#FBBC04" }}
                  title={`Writing: ${lockStatus.owner}${lockStatus.queueSize > 0 ? ` (${lockStatus.queueSize} queued)` : ""}`}
                >
                  <PencilSimple size={12} weight="bold" aria-hidden="true" />
                  Writing...
                </span>
              )}
              {lastScanResult && (
                <span
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
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
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "#4285f420", color: "#4285f4" }}
                  title={`${spectatorCount} spectator${spectatorCount > 1 ? "s" : ""} watching`}
                >
                  <Users size={12} weight="bold" aria-hidden="true" />
                  {spectatorCount}
                </span>
              )}
              <button
                onClick={() => setShareModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg cursor-pointer transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border)",
                }}
                aria-label="Share session"
                title="Share session"
              >
                <ShareNetwork size={12} weight="bold" aria-hidden="true" />
                Share
              </button>
            </div>

            {/* Mid-session model + thinking mode selectors */}
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
              </>
            )}

            {wsStatus !== "connected" && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: wsStatus === "connecting" ? "#FBBC0420" : "#EA433520",
                  color: wsStatus === "connecting" ? "#FBBC04" : "#EA4335",
                }}
              >
                {wsStatus}
              </span>
            )}

            {/* Terminal toggle */}
            <button
              onClick={toggleTerminal}
              className="p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{
                color: terminalOpen ? "#34A853" : "var(--color-text-muted)",
                background: terminalOpen ? "#34A85310" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!terminalOpen)
                  (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
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
              className="p-1.5 rounded-lg transition-colors cursor-pointer"
             
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
              className="relative p-1.5 rounded-lg transition-colors cursor-pointer"
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
                  className="absolute -top-0.5 -right-0.5 text-xs font-mono font-bold px-1 rounded-full leading-tight"
                  style={{
                    background: "#FBBC04",
                    color: "#000",
                    fontSize: 9,
                    minWidth: 14,
                    textAlign: "center",
                  }}
                >
                  {pinCount}
                </span>
              )}
            </button>
          </div>

          <ContextStatusBar session={session} />

          {/* Messages */}
          <MessageFeed messages={messages} sessionId={id} onScrollToRef={handleScrollToRef} />

          {/* Terminal panel — collapsible bottom section */}
          {terminalOpen && (
            <div
              style={{
                height: 240,
                minHeight: 120,
                borderTop: "1px solid var(--color-border)",
                flexShrink: 0,
              }}
            >
              <TerminalPanel defaultCwd={session?.state?.cwd} onClose={toggleTerminal} />
            </div>
          )}

          <PermissionGate permissions={pendingPermissions} onRespond={respondPermission} />
          <MessageComposer
            onSend={sendMessage}
            onStop={handleStop}
            isRunning={session?.status === "running"}
            projectSlug={session?.projectSlug ?? undefined}
          />
        </div>

        {/* Right panel */}
        <aside
          className="flex flex-col flex-shrink-0 overflow-y-auto border-l"
          style={{
            width: 300,
            background: "var(--color-bg-sidebar)",
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
            zIndex: 50,
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
  );
}
