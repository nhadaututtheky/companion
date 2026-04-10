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
  activeTab: string; // sessionId of the currently viewed tab
  onTabChange: (sessionId: string) => void;
  onSpawnClick?: () => void;
}

export function AgentTabBar({
  parentSessionId,
  activeTab,
  onTabChange,
  onSpawnClick,
}: AgentTabBarProps) {
  const childIds = useSessionStore((s) => s.sessions[parentSessionId]?.childSessionIds ?? []);
  const sessions = useSessionStore((s) => s.sessions);

  const isParentActive = activeTab === parentSessionId;

  return (
    <div
      className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0 overflow-x-auto"
      style={{
        borderBottom: "1px solid var(--glass-border)",
        scrollbarWidth: "none",
      }}
    >
      {/* Brain tab — always first */}
      <button
        onClick={() => onTabChange(parentSessionId)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all cursor-pointer flex-shrink-0"
        style={{
          background: isParentActive
            ? "color-mix(in srgb, var(--color-accent) 15%, transparent)"
            : "transparent",
          color: isParentActive ? "var(--color-accent)" : "var(--color-text-muted)",
          border: isParentActive
            ? "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)"
            : "1px solid transparent",
        }}
        aria-label="Brain (coordinator)"
        title="Brain — coordinator session"
      >
        <Brain size={11} weight="bold" />
        <span>Brain</span>
      </button>

      {/* Child agent tabs */}
      {childIds.map((childId) => {
        const child = sessions[childId];
        if (!child) return null;

        const isActive = activeTab === childId;
        const status = child.status ?? "idle";
        const style = STATUS_STYLES[status] ?? STATUS_STYLES.idle!;
        const roleIcon = ROLE_ICONS[child.brainRole ?? "specialist"] ?? "🔧";
        const isEnded = status === "ended";
        const isError = status === "error";

        return (
          <button
            key={childId}
            onClick={() => onTabChange(childId)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all cursor-pointer flex-shrink-0"
            style={{
              background: isActive
                ? "color-mix(in srgb, var(--color-accent) 15%, transparent)"
                : "transparent",
              color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
              border: isActive
                ? "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)"
                : "1px solid transparent",
              opacity: style.opacity,
            }}
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
                  background: style.dot,
                  flexShrink: 0,
                  animation: style.pulse ? "pulse 1.5s ease-in-out infinite" : "none",
                  boxShadow: style.pulse ? `0 0 4px ${style.dot}` : "none",
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
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs cursor-pointer flex-shrink-0 transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-text-muted)";
          }}
          aria-label="Spawn new agent"
          title="Spawn new agent"
        >
          <Plus size={10} weight="bold" />
        </button>
      )}
    </div>
  );
}
