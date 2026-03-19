"use client";
import { use } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { MessageFeed } from "@/components/session/message-feed";
import { MessageComposer } from "@/components/session/message-composer";
import { PermissionGate } from "@/components/session/permission-gate";
import { SessionDetails } from "@/components/session/session-details";
import { useSession } from "@/hooks/use-session";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SessionPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { messages, pendingPermissions, wsStatus, sendMessage, respondPermission } = useSession(id);
  const session = useSessionStore((s) => s.sessions[id]);

  const handleStop = async () => {
    try {
      await api.sessions.stop(id);
      toast.success("Session stopped");
    } catch {
      toast.error("Failed to stop session");
    }
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
          </div>

          {/* Messages */}
          <MessageFeed messages={messages} />
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
    </div>
  );
}
