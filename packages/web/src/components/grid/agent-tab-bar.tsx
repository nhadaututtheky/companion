"use client";
import { useSessionStore } from "@/lib/stores/session-store";
import { Plus, Brain, Check, XCircle } from "@phosphor-icons/react";

const ROLE_ICONS: Record<string, string> = {
  coordinator: "🧠",
  specialist: "🔧",
  researcher: "🔍",
  reviewer: "🧪",
};

const STATUS_STYLES: Record<string, { dot: string; opacity: number; pulse: boolean }> = {
  running: { dot: "var(--color-accent)", opacity: 1, pulse: true },
  busy: { dot: "var(--color-accent)", opacity: 1, pulse: true },
  idle: { dot: "var(--color-text-muted)", opacity: 0.6, pulse: false },
  starting: { dot: "var(--color-warning)", opacity: 0.8, pulse: true },
  ended: { dot: "var(--color-success)", opacity: 0.5, pulse: false },
  error: { dot: "var(--color-danger)", opacity: 0.7, pulse: false },
};

interface AgentTabBarProps {
  parentSessionId: string;
  activeTab: string;
  onTabChange: (sessionId: string) => void;
  onSpawnClick?: () => void;
}

export function AgentTabBar({
  parentSessionId,
  activeTab,
  onTabChange,
  onSpawnClick,
}: AgentTabBarProps) {
  const childIds = useSessionStore((s) => s.sessions[parentSessionId]?.childSessionIds);
  const sessions = useSessionStore((s) => s.sessions);

  const isParentActive = activeTab === parentSessionId;

  return (
    <div
      className="flex items-end gap-0 px-2 pt-1 flex-shrink-0 overflow-x-auto"
      style={{
        borderBottom: "1px solid var(--glass-border)",
        scrollbarWidth: "none",
      }}
    >
      {/* Brain tab — always first */}
      <button
        onClick={() => onTabChange(parentSessionId)}
        className={`agent-tab ${isParentActive ? "agent-tab--active" : "agent-tab--inactive"} flex items-center gap-1.5 text-xs font-semibold`}
        aria-label="Brain (coordinator)"
        title="Brain — coordinator session"
      >
        <Brain size={12} weight="bold" />
        <span>Brain</span>
      </button>

      {/* Child agent tabs */}
      {(childIds ?? []).map((childId) => {
        const child = sessions[childId];
        if (!child) return null;

        const isActive = activeTab === childId;
        const status = child.status ?? "idle";
        const sStyle = STATUS_STYLES[status] ?? STATUS_STYLES.idle!;
        const roleIcon = ROLE_ICONS[child.brainRole ?? "specialist"] ?? "🔧";
        const isEnded = status === "ended";
        const isError = status === "error";

        return (
          <button
            key={childId}
            onClick={() => onTabChange(childId)}
            className={`agent-tab ${isActive ? "agent-tab--active" : "agent-tab--inactive"} flex items-center gap-1.5 text-xs font-medium`}
            style={{ opacity: sStyle.opacity }}
            aria-label={`${child.agentName ?? child.shortId ?? "Agent"} — ${status}`}
            title={`${child.agentName ?? child.shortId ?? "Agent"} — ${status}`}
          >
            <span>{roleIcon}</span>
            <span className="truncate" style={{ maxWidth: 80 }}>
              {child.agentName ?? child.shortId ?? "Agent"}
            </span>

            {/* Status indicator */}
            {isEnded ? (
              <Check size={9} weight="bold" style={{ color: "var(--color-success)" }} />
            ) : isError ? (
              <XCircle size={9} weight="bold" style={{ color: "var(--color-danger)" }} />
            ) : (
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: sStyle.dot,
                  flexShrink: 0,
                  animation: sStyle.pulse ? "pulse 1.5s ease-in-out infinite" : "none",
                  boxShadow: sStyle.pulse ? `0 0 4px ${sStyle.dot}` : "none",
                }}
              />
            )}
          </button>
        );
      })}

      {/* Add agent button */}
      {onSpawnClick && (
        <button
          onClick={onSpawnClick}
          className="agent-tab agent-tab--inactive flex items-center justify-center"
          style={{ padding: "4px 8px" }}
          aria-label="Spawn new agent"
          title="Spawn new agent"
        >
          <Plus size={11} weight="bold" />
        </button>
      )}
    </div>
  );
}
