"use client";

import { useEffect, useState, useCallback } from "react";
import { Z } from "@/lib/z-index";
import {
  X,
  ChartBar,
  Lightning,
  CalendarCheck,
  Fire,
  Stack,
  CircleNotch,
  ArrowRight,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { useUiStore } from "@/lib/stores/ui-store";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface StatsData {
  today: { sessions: number; tokens: number; cost: number };
  week: { sessions: number; tokens: number; cost: number };
  streak: number;
  totalSessions: number;
  modelBreakdown: Array<{ model: string; count: number; tokens: number }>;
  dailyActivity: Array<{ date: string; sessions: number; tokens: number }>;
  topProjects: Array<{ name: string; sessions: number }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("haiku")) return "Haiku";
  return "Sonnet";
}

function modelColor(model: string): string {
  if (model.includes("opus")) return "#a78bfa";
  if (model.includes("haiku")) return "#34a853";
  return "#4285f4";
}

function heatmapColor(sessions: number): string {
  if (sessions === 0) return "var(--color-bg-elevated)";
  if (sessions <= 2) return "#4285f430";
  if (sessions <= 5) return "#4285f480";
  return "#4285f4";
}

// ── Stat Block ─────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  sub,
  icon,
  accent = "var(--color-accent)",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="flex min-w-[80px] flex-col items-center gap-0.5 px-4 py-2">
      <div className="flex items-center gap-1.5">
        <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
        <span className="text-text-muted text-[10px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className="text-text-primary font-mono text-lg font-bold tabular-nums leading-none">
        {value}
      </span>
      {sub && <span className="text-text-muted text-[10px]">{sub}</span>}
    </div>
  );
}

function Separator() {
  return <span className="my-2 w-px self-stretch" style={{ background: "var(--glass-border)" }} />;
}

// ── Mini Heatmap ───────────────────────────────────────────────────────────

function MiniHeatmap({ data }: { data: StatsData["dailyActivity"] }) {
  const cells = data.slice(-14);
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-2">
      <span className="text-text-muted text-[10px] font-medium uppercase tracking-wider">
        14-day
      </span>
      <div className="flex gap-[2px]">
        {cells.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${day.sessions} sessions`}
            style={{
              width: 8,
              height: 20,
              borderRadius: 2,
              background: heatmapColor(day.sessions),
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Model Pills ────────────────────────────────────────────────────────────

function ModelPills({ breakdown }: { breakdown: StatsData["modelBreakdown"] }) {
  const total = breakdown.reduce((sum, m) => sum + m.count, 0);
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {breakdown.map((m) => {
        const pct = Math.round((m.count / total) * 100);
        return (
          <div
            key={m.model}
            className="rounded-radius-pill flex items-center gap-1 px-2 py-1 text-[10px] font-semibold"
            style={{
              background: `color-mix(in srgb, ${modelColor(m.model)} 12%, transparent)`,
              color: modelColor(m.model),
              fontFamily: "var(--font-mono)",
            }}
          >
            {modelLabel(m.model)}
            <span className="opacity-70">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function FloatingStatsBar() {
  const open = useUiStore((s) => s.statsBarOpen);
  const setOpen = useUiStore((s) => s.setStatsBarOpen);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.stats.get();
      setData(res.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data) fetchStats();
  }, [open, data, fetchStats]);

  if (!open) return null;

  return (
    <div
      className="rounded-radius-xl shadow-soft hidden items-stretch sm:flex"
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: Z.popover,
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--shadow-float)",
        padding: "2px 6px",
        maxWidth: "90vw",
        animation: "slideUpFade 300ms ease forwards",
      }}
    >
      {/* Title + close */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <ChartBar size={14} weight="bold" className="text-accent" />
        <span className="text-text-primary text-xs font-semibold">Stats</span>
      </div>

      <Separator />

      {loading && (
        <div className="flex items-center gap-2 px-4 py-2">
          <CircleNotch size={14} className="text-text-muted animate-spin" />
          <span className="text-text-muted text-xs">Loading...</span>
        </div>
      )}

      {data && (
        <>
          <StatBlock
            label="Today"
            value={String(data.today.sessions)}
            sub={`${fmtCost(data.today.cost)} · ${fmtTokens(data.today.tokens)} tok`}
            icon={<Lightning size={11} weight="fill" />}
            accent="#FBBC04"
          />

          <Separator />

          <StatBlock
            label="Week"
            value={String(data.week.sessions)}
            sub={`${fmtCost(data.week.cost)} · ${fmtTokens(data.week.tokens)} tok`}
            icon={<CalendarCheck size={11} weight="fill" />}
            accent="#34A853"
          />

          <Separator />

          <StatBlock
            label="Streak"
            value={`${data.streak}d`}
            icon={<Fire size={11} weight="fill" />}
            accent="#EA4335"
          />

          <Separator />

          <StatBlock
            label="All-time"
            value={String(data.totalSessions)}
            icon={<Stack size={11} weight="fill" />}
          />

          <Separator />

          {data.dailyActivity.length > 0 && (
            <>
              <MiniHeatmap data={data.dailyActivity} />
              <Separator />
            </>
          )}

          {data.modelBreakdown.length > 0 && (
            <>
              <ModelPills breakdown={data.modelBreakdown} />
              <Separator />
            </>
          )}
        </>
      )}

      {/* Analytics link */}
      <Link
        href="/analytics"
        className="text-accent flex cursor-pointer items-center gap-1 px-3 py-2 text-xs font-medium transition-colors"
      >
        Full
        <ArrowRight size={10} weight="bold" />
      </Link>

      <Separator />

      {/* Close */}
      <button
        onClick={() => setOpen(false)}
        className="text-text-muted flex cursor-pointer items-center justify-center px-2 py-2 transition-colors"
        aria-label="Close stats bar"
      >
        <X size={12} weight="bold" />
      </button>
    </div>
  );
}
