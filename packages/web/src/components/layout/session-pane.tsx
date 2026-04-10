"use client";

import { useSession } from "@/hooks/use-session";
import { useSessionStore } from "@/lib/stores/session-store";
import { MessageFeed } from "@/components/session/message-feed";
import { MessageComposer } from "@/components/session/message-composer";
import { PermissionGate } from "@/components/session/permission-gate";
import { X, ArrowSquareOut } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";

interface SessionPaneProps {
  sessionId: string;
  onClose: () => void;
}

export function SessionPane({ sessionId, onClose }: SessionPaneProps) {
  const { messages, pendingPermissions, wsStatus, sendMessage, respondPermission } =
    useSession(sessionId);
  const session = useSessionStore((s) => s.sessions[sessionId]);

  const handleStop = async () => {
    try {
      await api.sessions.stop(sessionId);
      toast.success("Session stopped");
    } catch {
      toast.error("Failed to stop session");
    }
  };

  const statusColor =
    session?.status === "running"
      ? "#4285F4"
      : session?.status === "waiting"
        ? "#FBBC04"
        : session?.status === "error"
          ? "#EA4335"
          : "var(--color-text-muted)";

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--color-bg-base)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Pane header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{
          background: "var(--color-bg-card)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: statusColor,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold truncate flex-1">
          {session?.projectName ?? sessionId.slice(0, 8)}
        </span>
        <span className="text-xs font-mono">#{sessionId.slice(0, 6)}</span>

        {wsStatus !== "connected" && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: wsStatus === "connecting" ? "#FBBC0420" : "#EA433520",
              color: wsStatus === "connecting" ? "#FBBC04" : "#EA4335",
              fontSize: 10,
            }}
          >
            {wsStatus}
          </span>
        )}

        <Link
          href={`/sessions/${sessionId}`}
          className="p-1 rounded cursor-pointer transition-colors"
          aria-label="Open full session page"
          title="Open full page"
        >
          <ArrowSquareOut size={12} weight="bold" />
        </Link>
        <button
          onClick={onClose}
          className="p-1 rounded cursor-pointer transition-colors"
          style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
          aria-label="Unpin session from pane"
          title="Unpin"
        >
          <X size={12} weight="bold" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageFeed messages={messages} sessionId={sessionId} />
      </div>

      {/* Permission gate + composer */}
      <PermissionGate permissions={pendingPermissions} onRespond={respondPermission} />
      <MessageComposer
        onSend={sendMessage}
        onStop={handleStop}
        isRunning={session?.status === "running"}
        projectSlug={session?.projectSlug ?? undefined}
        compact
      />
    </div>
  );
}
