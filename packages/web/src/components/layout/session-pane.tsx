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
      className="bg-bg-base shadow-soft flex h-full flex-col overflow-hidden rounded-lg"
    >
      {/* Pane header */}
      <div
        className="bg-bg-card flex shrink-0 items-center gap-2 px-3 py-1.5"
      >
        <span
          className="shrink-0 rounded-full"
          style={{
            width: 6,
            height: 6,
            background: statusColor,
          }}
          aria-hidden="true"
        />
        <span className="flex-1 truncate text-xs font-semibold">
          {session?.projectName ?? sessionId.slice(0, 8)}
        </span>
        <span className="font-mono text-xs">#{sessionId.slice(0, 6)}</span>

        {wsStatus !== "connected" && (
          <span
            className="rounded px-1.5 py-0.5 text-xs"
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
          className="cursor-pointer rounded p-1 transition-colors"
          aria-label="Open full session page"
          title="Open full page"
        >
          <ArrowSquareOut size={12} weight="bold" />
        </Link>
        <button
          onClick={onClose}
          className="text-text-muted cursor-pointer rounded p-1 transition-colors"
          style={{ background: "none", border: "none" }}
          aria-label="Unpin session from pane"
          title="Unpin"
        >
          <X size={12} weight="bold" />
        </button>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-hidden">
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
