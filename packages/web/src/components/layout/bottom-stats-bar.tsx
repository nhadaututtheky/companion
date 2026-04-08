"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/lib/stores/session-store";

const ACTIVE_STATUSES = ["starting", "running", "waiting", "idle", "busy"];

interface StatItemProps {
  value: string;
  label: string;
  sublabel?: string;
  highlight?: boolean;
}

function StatItem({ value, label, sublabel, highlight }: StatItemProps) {
  return (
    <div
      className="flex flex-col items-center justify-center px-5 py-2.5"
      style={{
        background: highlight
          ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
          : "transparent",
        borderRadius: highlight ? "var(--radius-lg)" : undefined,
        minWidth: 80,
      }}
    >
      {/* Small top label */}
      <span
        className="text-[10px] font-medium uppercase tracking-wider mb-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      {/* Big value */}
      <span
        className="text-lg font-bold tabular-nums leading-none"
        style={{
          fontFamily: "var(--font-mono)",
          color: highlight ? "var(--color-accent)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </span>
      {/* Optional sublabel */}
      {sublabel && (
        <span
          className="text-[10px] mt-0.5"
          style={{ color: "var(--color-text-muted)" }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}

function Separator() {
  return (
    <span
      className="w-px self-stretch my-2"
      style={{ background: "var(--glass-border)" }}
    />
  );
}

export function BottomStatsBar() {
  const sessions = useSessionStore((s) => s.sessions);

  const { activeCount, totalCount, totalCost, totalTurns, totalTokens } = useMemo(() => {
    const all = Object.values(sessions);
    const active = all.filter((s) => ACTIVE_STATUSES.includes(s.status));
    const cost = active.reduce((sum, s) => sum + (s.state?.total_cost_usd ?? 0), 0);
    const turns = active.reduce((sum, s) => sum + (s.state?.num_turns ?? 0), 0);
    const tokens = active.reduce(
      (sum, s) => sum + (s.state?.total_input_tokens ?? 0) + (s.state?.total_output_tokens ?? 0),
      0,
    );
    return {
      activeCount: active.length,
      totalCount: all.length,
      totalCost: cost,
      totalTurns: turns,
      totalTokens: tokens,
    };
  }, [sessions]);

  // Don't show if no sessions
  if (activeCount === 0) return null;

  const fmtTokens = (t: number) => {
    if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
    if (t >= 1_000) return `${(t / 1_000).toFixed(1)}K`;
    return String(t);
  };

  const fmtCost = (c: number) => {
    if (c < 0.01 && c > 0) return "<0.01";
    return c.toFixed(2);
  };

  return (
    <div
      className="hidden sm:flex items-stretch animate-[slideUpFade_300ms_ease_forwards]"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.08), var(--shadow-float)",
        padding: "2px 4px",
      }}
    >
      <StatItem
        value={String(activeCount)}
        label="Sessions"
        sublabel={`of ${totalCount}`}
      />

      <Separator />

      <StatItem
        value={String(totalTurns)}
        label="Turns"
      />

      <Separator />

      <StatItem
        value={`$${fmtCost(totalCost)}`}
        label="Cost"
        sublabel="USD"
        highlight
      />

      <Separator />

      <StatItem
        value={fmtTokens(totalTokens)}
        label="Tokens"
        sublabel="in + out"
      />
    </div>
  );
}
