"use client";
import { useEffect, useRef, useCallback, useState, type KeyboardEvent } from "react";
import { PaperPlaneTilt, Lock, CheckCircle, XCircle } from "@phosphor-icons/react";
import { useSession } from "@/hooks/use-session";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { SessionHeader } from "./session-header";
import { CompactMessageFeed } from "./compact-message";


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
      className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
      style={{
        borderTop: "1px solid #FBBC04",
        background: "#FBBC0408",
      }}
    >
      <Lock size={11} weight="bold" style={{ color: "#FBBC04", flexShrink: 0 }} />
      <span
        className="text-xs font-medium truncate flex-1"
        style={{ color: "var(--color-text-primary)" }}
      >
        {req.toolName}
      </span>
      <button
        onClick={() => onRespond(req.requestId, "allow")}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold cursor-pointer flex-shrink-0"
        style={{ background: "#34A853", color: "#fff" }}
        aria-label="Allow"
      >
        <CheckCircle size={10} weight="bold" /> Allow
      </button>
      <button
        onClick={() => onRespond(req.requestId, "deny")}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold cursor-pointer flex-shrink-0"
        style={{
          background: "var(--color-bg-elevated)",
          color: "#EA4335",
          border: "1px solid #EA433530",
        }}
        aria-label="Deny"
      >
        <XCircle size={10} weight="bold" /> Deny
      </button>
      {permissions.length > 1 && (
        <span
          className="text-xs flex-shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          +{permissions.length - 1}
        </span>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isRunning) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      className="flex items-end gap-2 px-2 py-2 flex-shrink-0"
      style={{ borderTop: "1px solid var(--color-border)" }}
    >
      <div
        className="flex items-end gap-1 flex-1 rounded-xl px-2 py-1.5"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={isRunning}
          placeholder={isRunning ? "Claude is thinking…" : "Message…"}
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none leading-snug"
          style={{
            fontSize: 12,
            color: "var(--color-text-primary)",
            maxHeight: 72,
            minHeight: 18,
            fontFamily: "var(--font-body)",
          }}
          aria-label="Message input"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isRunning}
          className="flex-shrink-0 p-1 rounded-lg transition-all cursor-pointer disabled:opacity-40"
          style={{
            background: text.trim() && !isRunning ? "#34A853" : "var(--color-bg-elevated)",
            color: text.trim() && !isRunning ? "#fff" : "var(--color-text-muted)",
          }}
          aria-label="Send message"
        >
          <PaperPlaneTilt size={12} weight="fill" />
        </button>
      </div>
    </div>
  );
}

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];

function getSessionColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return GOOGLE_COLORS[Math.abs(hash) % GOOGLE_COLORS.length]!;
}

function getMaxContextTokens(model: string): number {
  if (model.includes("haiku")) return 200_000;
  return 1_000_000;
}

export function MiniTerminal({ sessionId, onExpand }: MiniTerminalProps) {
  const { messages, pendingPermissions, wsStatus, sendMessage, respondPermission } =
    useSession(sessionId);

  const session = useSessionStore((s) => s.sessions[sessionId]);
  const isRunning = session?.status === "running" || session?.status === "busy";

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

  const handleClose = useCallback(async () => {
    // Immediately update local state so grid removes it
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
      className="flex flex-col overflow-hidden rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: hasSharedContext
          ? `2px dashed ${sessionColor}`
          : "1px solid var(--color-border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Header */}
      <SessionHeader
        sessionId={sessionId}
        shortId={session?.shortId ?? session?.state?.short_id}
        projectName={session?.projectName ?? sessionId}
        model={session?.model ?? ""}
        status={session?.status ?? "idle"}
        onExpand={handleExpand}
        onClose={handleClose}
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
      />

      {/* WS Status banner */}
      {wsStatus !== "connected" && (
        <div
          className="flex items-center justify-center py-1 text-xs font-medium flex-shrink-0"
          style={{
            background: wsStatus === "connecting" ? "#FBBC0420" : "#EA433520",
            color: wsStatus === "connecting" ? "#FBBC04" : "#EA4335",
            fontSize: 10,
          }}
        >
          {wsStatus === "connecting" ? "Connecting…" : "Disconnected — reconnecting…"}
        </div>
      )}

      {/* Message feed */}
      <CompactMessageFeed messages={messages} feedRef={feedRef} />

      {/* Permission gate */}
      <CompactPermissionGate
        permissions={pendingPermissions}
        onRespond={respondPermission}
      />

      {/* Composer */}
      <CompactComposer onSend={sendMessage} isRunning={isRunning} />
    </div>
  );
}
