"use client";
import { CurrencyDollar, Lightning, ArrowsCounterClockwise, Robot } from "@phosphor-icons/react";

interface StatsGridProps {
  activeSessions: number;
  totalCostToday: number;
  totalTurnsToday: number;
  totalCostAllTime: number;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-2xl"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</p>
        <span
          className="p-1.5 rounded-lg"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
      </div>
      <p className="text-2xl font-bold font-mono" style={{ color: "var(--color-text-primary)" }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{sub}</p>
      )}
    </div>
  );
}

export function StatsGrid({ activeSessions, totalCostToday, totalTurnsToday, totalCostAllTime }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        icon={<Lightning size={14} weight="bold" />}
        label="Active Sessions"
        value={String(activeSessions)}
        sub={activeSessions === 1 ? "1 running" : `${activeSessions} running`}
        color="#4285F4"
      />
      <StatCard
        icon={<CurrencyDollar size={14} weight="bold" />}
        label="Cost Today"
        value={`$${totalCostToday.toFixed(2)}`}
        sub="API usage"
        color="#34A853"
      />
      <StatCard
        icon={<ArrowsCounterClockwise size={14} weight="bold" />}
        label="Turns Today"
        value={String(totalTurnsToday)}
        sub="messages exchanged"
        color="#FBBC04"
      />
      <StatCard
        icon={<Robot size={14} weight="bold" />}
        label="All-Time Cost"
        value={`$${totalCostAllTime.toFixed(2)}`}
        sub="lifetime"
        color="#EA4335"
      />
    </div>
  );
}
