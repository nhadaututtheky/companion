"use client";
import { useEffect, useRef, useCallback, useState, type KeyboardEvent } from "react";
import { Z } from "@/lib/z-index";
import {
  PaperPlaneTilt,
  Lock,
  CheckCircle,
  XCircle,
  Warning,
  TelegramLogo,
} from "@phosphor-icons/react";
import { useSession } from "@/hooks/use-session";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { SessionHeader } from "./session-header";
import { CompactMessageFeed } from "./compact-message";
import { AgentTabBar } from "./agent-tab-bar";
import { SpawnAgentModal } from "@/components/session/spawn-agent-modal";
import { SlashCommandMenu } from "@/components/session/slash-commands";

interface ChannelInfo {
  id: string;
  topic: string;
  status: string;
}

interface MiniTerminalProps {
  sessionId: string;
  onExpand: (id: string) => void;
}

function CompactPermissionGate({
  permissions,
  onRespond,
}: {
  permissions: { requestId: string; toolName: string; description?: string }[];
  onRespond: (id: string, behavior: "allow" | "deny") => void;
}) {
  if (permissions.length === 0) return null;

  const req = permissions[0]!;

  return (
    <div
      className="flex flex-shrink-0 items-center gap-2 px-3 py-2"
      style={{
        borderTop: "1px solid var(--glass-border)",
        background: "color-mix(in srgb, var(--color-warning) 6%, transparent)",
        borderRadius: "0 0 var(--radius-xl) var(--radius-xl)",
      }}
    >
      <Lock size={11} weight="bold" className="shrink-0" style={{ color: "#FBBC04" }} />
      <span className="flex-1 truncate text-xs font-medium">{req.toolName}</span>
      <button
        onClick={() => onRespond(req.requestId, "allow")}
        className="flex flex-shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
        style={{ background: "#34A853", color: "#fff" }}
        aria-label="Allow"
      >
        <CheckCircle size={10} weight="bold" /> Allow
      </button>
      <button
        onClick={() => onRespond(req.requestId, "deny")}
        className="bg-bg-elevated flex flex-shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
        style={{
          color: "#EA4335",
          border: "1px solid #EA433530",
        }}
        aria-label="Deny"
      >
        <XCircle size={10} weight="bold" /> Deny
      </button>
      {permissions.length > 1 && (
        <span className="flex-shrink-0 text-xs">+{permissions.length - 1}</span>
      )}
    </div>
  );
}

function CompactComposer({
  onSend,
  isRunning,
}: {
  onSend: (text: string) => void;
  isRunning: boolean;
}) {
  const [text, setText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const updateSlashMenu = useCallback((value: string) => {
    const match = value.match(/^\/(\S*)$/);
    if (match) {
      setSlashMenuOpen(true);
      setSlashQuery("/" + match[1]);
    } else {
      setSlashMenuOpen(false);
    }
  }, []);

  const handleSlashSelect = useCallback((command: string) => {
    setText(command + " ");
    setSlashMenuOpen(false);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen && ["ArrowUp", "ArrowDown", "Tab", "Escape"].includes(e.key)) {
      return;
    }
    if (slashMenuOpen && e.key === "Enter" && !e.shiftKey) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
  };

  return (
    <div
      ref={wrapperRef}
      className="relative flex flex-shrink-0 items-end gap-2 px-3 py-2.5"
      style={{ borderTop: "1px solid var(--glass-border)" }}
    >
      <SlashCommandMenu
        query={slashQuery}
        visible={slashMenuOpen}
        onSelect={handleSlashSelect}
        onClose={() => setSlashMenuOpen(false)}
        anchorRef={wrapperRef}
      />
      <div
        className="bg-bg-elevated rounded-radius-pill flex flex-1 items-end gap-1 px-2.5 py-1.5"
        style={{
          border: isFocused
            ? "1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)"
            : "1px solid var(--glass-border)",
          boxShadow: isFocused
            ? "0 0 0 3px color-mix(in srgb, var(--color-accent) 10%, transparent)"
            : "none",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            updateSlashMenu(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={isRunning ? "Type to interrupt…" : "Message…"}
          rows={1}
          className="composer-textarea text-text-primary flex-1 resize-none bg-transparent leading-snug"
          style={{
            fontSize: 12,
            maxHeight: 72,
            minHeight: 18,
            fontFamily: "var(--font-body)",
            outline: "none",
          }}
          aria-label="Message input"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="flex-shrink-0 cursor-pointer rounded-full p-1 transition-all disabled:opacity-40"
          style={{
            background: text.trim()
              ? isRunning
                ? "#D97706"
                : "#34A853"
              : "var(--color-bg-elevated)",
            color: text.trim() ? "#fff" : "var(--color-text-muted)",
          }}
          aria-label="Send message"
        >
          <PaperPlaneTilt size={12} weight="fill" />
        </button>
      </div>
    </div>
  );
}

const SESSION_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853", "#FF6D00", "#00BCD4"];

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length]!;
}

function getMaxContextTokens(model: string): number {
  if (model.includes("haiku")) return 200_000;
  return 1_000_000;
}

export function MiniTerminal({ sessionId, onExpand }: MiniTerminalProps) {
  const [activeTab, setActiveTab] = useState(sessionId);
  const [spawnOpen, setSpawnOpen] = useState(false);

  // Always connect to parent session (for events, status)
  const parentHook = useSession(sessionId);
  // Connect to active child if tab switched (empty string = no WS connection)
  const childHook = useSession(activeTab !== sessionId ? activeTab : "");

  // Use the active tab's hook for display
  const activeHook = activeTab === sessionId ? parentHook : childHook;
  const { messages, pendingPermissions, wsStatus, sendMessage, respondPermission, setModel } =
    activeHook;

  const session = useSessionStore((s) => s.sessions[sessionId]);
  const childIds = useSessionStore((s) => s.sessions[sessionId]?.childSessionIds);
  const flashType = useSessionStore((s) => s.sessions[sessionId]?.flashType);
  const isRunning = session?.status === "running" || session?.status === "busy";
  const hasChildren = !!childIds && childIds.length > 0;

  // Context meter calculation
  const contextData = (() => {
    const state = session?.state;
    if (!state) return undefined;
    const totalTokens =
      (state.total_input_tokens ?? 0) +
      (state.total_output_tokens ?? 0) +
      (state.cache_read_tokens ?? 0);
    if (totalTokens === 0) return undefined;
    const maxTokens = getMaxContextTokens(state.model ?? "");
    const contextPercent = Math.min(100, (totalTokens / maxTokens) * 100);
    return { contextPercent, totalTokens, maxTokens };
  })();

  const feedRef = useRef<HTMLDivElement>(null);
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);

  // Fetch channel info if session has a channelId
  useEffect(() => {
    api.sessions
      .get(sessionId)
      .then(async (res) => {
        const record = res.data as { channelId?: string | null };
        if (!record.channelId) return;
        try {
          const ch = await api.channels.get(record.channelId);
          setChannelInfo({
            id: ch.data.id,
            topic: ch.data.topic,
            status: ch.data.status,
          });
        } catch {
          // channel may not exist
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleExpand = useCallback(() => {
    onExpand(sessionId);
  }, [sessionId, onExpand]);

  const handleMinimize = useCallback(() => {
    useSessionStore.getState().removeFromGrid(sessionId);
    toast.success("Session minimized — find it in the sidebar");
  }, [sessionId]);

  const handleClose = useCallback(async () => {
    const session = useSessionStore.getState().sessions[sessionId];
    const isActive =
      session && ["starting", "running", "waiting", "idle", "busy"].includes(session.status);

    if (isActive) {
      const confirmed = window.confirm(
        `Stop session "${session.projectName || session.shortId || sessionId.slice(0, 8)}"?\n\nThis will terminate the running agent.`,
      );
      if (!confirmed) return;
    }

    useSessionStore.getState().setSession(sessionId, { status: "ended", shortId: undefined });
    useSessionStore.getState().removeFromGrid(sessionId);
    try {
      await api.sessions.stop(sessionId);
    } catch {
      // session may already be ended
    }
    toast.success("Session closed");
  }, [sessionId]);

  const sessionColor = getSessionColor(sessionId);
  const hasSharedContext = !!channelInfo;

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border:
          session?.status === "error"
            ? "1px solid var(--color-danger)"
            : hasSharedContext
              ? `2px dashed ${sessionColor}`
              : "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: flashType
          ? `0 0 0 3px ${flashType === "error" ? "#EA4335" : flashType === "success" ? "#34A853" : "var(--color-accent)"}60, var(--shadow-float)`
          : "var(--shadow-float)",
        transition: "box-shadow 300ms ease",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <SessionHeader
        sessionId={sessionId}
        shortId={session?.shortId ?? session?.state?.short_id}
        projectName={session?.projectName ?? sessionId}
        sessionColor={sessionColor}
        model={session?.model ?? ""}
        status={session?.status ?? "idle"}
        onExpand={handleExpand}
        onClose={handleClose}
        onSpawnClick={() => setSpawnOpen(true)}
        channelId={channelInfo?.id}
        channelTopic={channelInfo?.topic}
        channelStatus={channelInfo?.status}
        contextPercent={contextData?.contextPercent}
        totalTokens={contextData?.totalTokens}
        maxTokens={contextData?.maxTokens}
        totalCostUsd={session?.state?.total_cost_usd}
        totalInputTokens={session?.state?.total_input_tokens}
        totalOutputTokens={session?.state?.total_output_tokens}
        cacheCreationTokens={session?.state?.cache_creation_tokens}
        cacheReadTokens={session?.state?.cache_read_tokens}
        cliPlatform={session?.state?.cli_platform}
        source={session?.state?.source}
        onSetModel={setModel}
        onMinimize={handleMinimize}
      />

      {/* WS Status banner */}
      {wsStatus !== "connected" && (
        <div
          className="flex flex-shrink-0 items-center justify-center py-1 text-xs font-medium"
          style={{
            background: wsStatus === "connecting" ? "#FBBC0420" : "#EA433520",
            color: wsStatus === "connecting" ? "#FBBC04" : "#EA4335",
            fontSize: 10,
          }}
        >
          {wsStatus === "connecting" ? "Connecting…" : "Disconnected — reconnecting…"}
        </div>
      )}

      {/* Agent tab bar — only shown when multi-brain is active */}
      {childIds && childIds.length > 0 && (
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

      {/* Error state — session crashed before starting */}
      {session?.status === "error" && messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <Warning size={24} weight="bold" className="text-danger" />
          <p className="text-danger text-xs font-medium">Session failed to start</p>
          <p className="text-text-muted text-xs" style={{ maxWidth: 240 }}>
            Check that the CLI is installed and authenticated. Click X to close.
          </p>
        </div>
      ) : (
        <>
          {/* Message feed with Telegram watermark */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {session?.state?.source === "telegram" && (
              <div
                className="absolute flex"
                style={{
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  zIndex: Z.base,
                }}
              >
                <TelegramLogo
                  size={120}
                  weight="thin"
                  className="text-text-muted"
                  style={{ opacity: 0.06 }}
                />
              </div>
            )}
            <CompactMessageFeed messages={messages} feedRef={feedRef} />
          </div>

          {/* Permission gate */}
          <CompactPermissionGate permissions={pendingPermissions} onRespond={respondPermission} />

          {/* Composer */}
          <CompactComposer onSend={sendMessage} isRunning={isRunning} />
        </>
      )}

      {/* Spawn agent modal */}
      <SpawnAgentModal
        parentSessionId={sessionId}
        parentModel={session?.model ?? "claude-sonnet-4-6"}
        open={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        onSpawned={(childSessionId, childShortId, name, role) => {
          const store = useSessionStore.getState();
          // Register child session in store
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
          // Track child in parent
          store.addChildSession(sessionId, childSessionId);
        }}
      />
    </div>
  );
}
