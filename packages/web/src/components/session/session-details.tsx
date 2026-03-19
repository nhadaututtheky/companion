"use client";
import {
  CurrencyDollar,
  ArrowsCounterClockwise,
  File,
  Robot,
  Clock,
} from "@phosphor-icons/react";
import { ContextMeter } from "./context-meter";

interface SessionDetailsProps {
  session: {
    id: string;
    projectName: string;
    model: string;
    status: string;
    state: {
      total_cost_usd: number;
      num_turns: number;
      total_input_tokens: number;
      total_output_tokens: number;
      cache_read_tokens: number;
      files_modified: string[];
      files_created: string[];
      started_at: number;
    };
  } | null;
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: `1px solid var(--color-border)`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <div>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</p>
        <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function SessionDetails({ session }: SessionDetailsProps) {
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <Robot size={36} style={{ color: "var(--color-text-muted)" }} />
        <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
          Select a session to view details
        </p>
      </div>
    );
  }

  const s = session.state;
  const elapsed = s.started_at ? Date.now() - s.started_at : 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Session header */}
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
          {session.projectName}
        </p>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {session.model}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
            style={{
              background:
                session.status === "running" ? "#4285F420" :
                session.status === "waiting" ? "#FBBC0420" :
                "var(--color-bg-elevated)",
              color:
                session.status === "running" ? "#4285F4" :
                session.status === "waiting" ? "#FBBC04" :
                "var(--color-text-muted)",
            }}
          >
            {session.status}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            #{session.id.slice(0, 8)}
          </span>
        </div>
      </div>

      {/* Context meter */}
      <ContextMeter
        inputTokens={s.total_input_tokens}
        outputTokens={s.total_output_tokens}
      />

      {/* Stats */}
      <div className="flex flex-col gap-2 px-4 pb-4">
        <StatCard
          icon={<CurrencyDollar size={16} weight="bold" />}
          label="Total Cost"
          value={`$${s.total_cost_usd.toFixed(4)}`}
          color="#34A853"
        />
        <StatCard
          icon={<ArrowsCounterClockwise size={16} weight="bold" />}
          label="Turns"
          value={String(s.num_turns)}
          color="#4285F4"
        />
        <StatCard
          icon={<Clock size={16} weight="bold" />}
          label="Duration"
          value={elapsed > 0 ? formatDuration(elapsed) : "—"}
          color="#FBBC04"
        />
        <StatCard
          icon={<Robot size={16} weight="bold" />}
          label="Tokens"
          value={`${formatTokens(s.total_input_tokens + s.total_output_tokens)}`}
          color="#EA4335"
        />
      </div>

      {/* Modified files */}
      {(s.files_modified.length > 0 || s.files_created.length > 0) && (
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
            Files
          </p>
          <div className="flex flex-col gap-1">
            {s.files_created.map((f) => (
              <div key={`c-${f}`} className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "#34A853" }}>+</span>
                <span className="text-xs font-mono truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {f.split("/").pop()}
                </span>
              </div>
            ))}
            {s.files_modified.map((f) => (
              <div key={`m-${f}`} className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "#FBBC04" }}>~</span>
                <span className="text-xs font-mono truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {f.split("/").pop()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
