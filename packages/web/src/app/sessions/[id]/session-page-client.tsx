"use client";
import { use, useRef, useState } from "react";
import { ArrowLeft, PushPin } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { MessageFeed, type Message } from "@/components/session/message-feed";
import { MessageComposer } from "@/components/session/message-composer";
import { PermissionGate } from "@/components/session/permission-gate";
import { SessionDetails } from "@/components/session/session-details";
import { PinnedMessagesDrawer } from "@/components/session/pinned-messages-drawer";
import { ModelSelector } from "@/components/session/model-selector";
import { usePinnedMessagesStore } from "@/lib/stores/pinned-messages-store";
import { useSession } from "@/hooks/use-session";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface PageProps {
  params: Promise<{ id: string }>;
}

function ContextStatusBar({ session }: { session: { state?: Partial<import("@companion/shared").SessionState>; contextUsedPercent?: number; contextTokens?: number; contextMaxTokens?: number } | undefined }) {
  if (!session?.state) return null;

  // Prefer real-time context data from CLI polling when available
  const hasRealtimeContext = session.contextTokens !== undefined && session.contextMaxTokens !== undefined;

  const { total_input_tokens = 0, total_output_tokens = 0, cache_read_tokens = 0, model = "" } = session.state;
  const fallbackTotal = total_input_tokens + total_output_tokens + cache_read_tokens;

  const totalTokens = hasRealtimeContext ? session.contextTokens! : fallbackTotal;
  const maxTokens = hasRealtimeContext ? session.contextMaxTokens! : (model.includes("haiku") ? 200_000 : 1_000_000);

  if (totalTokens === 0) return null;

  const pct = hasRealtimeContext ? (session.contextUsedPercent ?? 0) : Math.min(100, (totalTokens / maxTokens) * 100);
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
      <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
        {formatK(totalTokens)} / {formatK(maxTokens)}
      </span>
      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        · {formatK(remaining)} remaining
      </span>
    </div>
  );
}

export function SessionPageClient({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { messages, pendingPermissions, wsStatus, sendMessage, respondPermission, setModel } = useSession(id);
  const session = useSessionStore((s) => s.sessions[id]);
  const [pinnedDrawerOpen, setPinnedDrawerOpen] = useState(false);
  const scrollToMessageRef = useRef<((index: number) => void) | null>(null);
  const getPins = usePinnedMessagesStore((s) => s.getPins);
  const pinCount = getPins(id).length;

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
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="Back"
            >
              <ArrowLeft size={16} weight="bold" />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                {session?.projectName ?? id.slice(0, 8)}
              </span>
              <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                #{id.slice(0, 8)}
              </span>
            </div>

            {/* Mid-session model selector */}
            {session?.status !== "ended" && session?.status !== "error" && (
              <ModelSelector
                currentModel={session?.model ?? "claude-sonnet-4-6"}
                onModelChange={setModel}
                disabled={session?.status === "starting"}
              />
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

            {/* Pinned messages toggle */}
            <button
              onClick={() => setPinnedDrawerOpen(true)}
              className="relative p-1.5 rounded-lg transition-colors cursor-pointer"
              style={{ color: pinCount > 0 ? "#FBBC04" : "var(--color-text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              aria-label={`Pinned messages${pinCount > 0 ? ` (${pinCount})` : ""}`}
              title="Pinned messages"
            >
              <PushPin size={16} weight={pinCount > 0 ? "fill" : "bold"} />
              {pinCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-xs font-mono font-bold px-1 rounded-full leading-tight"
                  style={{ background: "#FBBC04", color: "#000", fontSize: 9, minWidth: 14, textAlign: "center" }}
                >
                  {pinCount}
                </span>
              )}
            </button>
          </div>

          <ContextStatusBar session={session} />

          {/* Messages */}
          <MessageFeed
            messages={messages}
            sessionId={id}
            onScrollToRef={handleScrollToRef}
          />
          <PermissionGate permissions={pendingPermissions} onRespond={respondPermission} />
          <MessageComposer
            onSend={sendMessage}
            onStop={handleStop}
            isRunning={session?.status === "running"}
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
          <SessionDetails session={session as any} />
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
    </div>
  );
}
