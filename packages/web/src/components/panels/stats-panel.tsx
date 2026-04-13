"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  ChartBar,
  Lightning,
  CalendarCheck,
  Fire,
  Stack,
  CircleNotch,
  WarningCircle,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
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

interface StatsPanelProps {
  onClose: () => void;
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
  if (model.includes("opus")) return "#a78bfa"; // purple
  if (model.includes("haiku")) return "#34a853"; // green
  return "#4285f4"; // blue — sonnet
}

function heatmapColor(sessions: number): string {
  if (sessions === 0) return "var(--color-bg-elevated)";
  if (sessions <= 2) return "#4285f430";
  if (sessions <= 5) return "#4285f480";
  return "#4285f4";
}

// ── KPI card ──────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}

function KpiCard({ label, value, sub, icon, accent = "#4285f4" }: KpiCardProps) {
  return (
    <div className="bg-bg-elevated shadow-soft flex min-w-0 flex-1 flex-col gap-1 rounded-lg p-3">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs">{label}</span>
        <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
      </div>
      <span
        className="text-text-primary text-lg font-bold leading-tight"
        style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        }}
      >
        {value}
      </span>
      {sub && <span className="truncate text-xs">{sub}</span>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wide">{children}</span>;
}

// ── Main component ────────────────────────────────────────────────────────

export function StatsPanel({ onClose }: StatsPanelProps) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.stats.get();
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div
      className="text-text-primary flex h-full flex-col"
      style={{ background: "var(--color-bg-card)" }}
    >
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-3"
        style={{ boxShadow: "0 1px 0 var(--glass-border)" }}
      >
        <div className="flex items-center gap-2">
          <ChartBar size={16} weight="bold" style={{ color: "#4285f4" }} aria-hidden="true" />
          <span className="text-sm font-semibold">Activity Stats</span>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
          aria-label="Close stats panel"
        >
          <X size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12">
            <CircleNotch size={18} className="animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading stats…</span>
          </div>
        )}

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ background: "#EA433515", color: "#EA4335", border: "1px solid #EA433530" }}
          >
            <WarningCircle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── KPI row ── */}
            <div className="flex flex-col gap-2">
              <SectionLabel>Overview</SectionLabel>
              <div className="flex gap-2">
                <KpiCard
                  label="Today"
                  value={String(data.today.sessions)}
                  sub={`${fmtCost(data.today.cost)} · ${fmtTokens(data.today.tokens)} tok`}
                  icon={<Lightning size={13} weight="fill" />}
                  accent="#FBBC04"
                />
                <KpiCard
                  label="This week"
                  value={String(data.week.sessions)}
                  sub={`${fmtCost(data.week.cost)} · ${fmtTokens(data.week.tokens)} tok`}
                  icon={<CalendarCheck size={13} weight="fill" />}
                  accent="#34A853"
                />
              </div>
              <div className="flex gap-2">
                <KpiCard
                  label="Streak"
                  value={`${data.streak}d`}
                  sub={data.streak === 1 ? "1 day active" : `${data.streak} days in a row`}
                  icon={<Fire size={13} weight="fill" />}
                  accent="#EA4335"
                />
                <KpiCard
                  label="All-time"
                  value={String(data.totalSessions)}
                  sub="total sessions"
                  icon={<Stack size={13} weight="fill" />}
                  accent="#4285f4"
                />
              </div>
            </div>

            {/* ── Activity heatmap ── */}
            <div className="flex flex-col gap-2">
              <SectionLabel>30-day activity</SectionLabel>
              <ActivityHeatmap data={data.dailyActivity} />
            </div>

            {/* ── Model breakdown ── */}
            {data.modelBreakdown.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Model usage</SectionLabel>
                <ModelBreakdown breakdown={data.modelBreakdown} />
              </div>
            )}

            {/* ── Top projects ── */}
            {data.topProjects.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionLabel>Top projects (30d)</SectionLabel>
                <TopProjects projects={data.topProjects} />
              </div>
            )}

            {/* Link to full analytics */}
            <Link
              href="/analytics"
              className="text-accent bg-bg-elevated shadow-soft flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors"
            >
              <ChartBar size={12} weight="bold" aria-hidden="true" />
              View full analytics
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ── Activity Heatmap ──────────────────────────────────────────────────────

function ActivityHeatmap({ data }: { data: StatsData["dailyActivity"] }) {
  // We display 30 cells in a 6-column × 5-row layout (most recent at bottom-right)
  const cells = data.slice(-30);

  return (
    <div className="bg-bg-elevated shadow-soft rounded-lg p-3">
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(10, 1fr)",
          gap: 3,
        }}
      >
        {cells.map((day) => {
          const label = `${day.date}: ${day.sessions} session${day.sessions !== 1 ? "s" : ""}`;
          return (
            <div
              key={day.date}
              title={label}
              aria-label={label}
              style={{
                width: "100%",
                paddingBottom: "100%", // square via aspect-ratio trick
                borderRadius: "var(--radius-xs)",
                background: heatmapColor(day.sessions),
                cursor: "default",
                transition: "background 150ms ease",
              }}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="text-xs">Less</span>
        {[0, 1, 3, 5, 7].map((n) => (
          <div
            key={n}
            className="border-border size-2.5 shrink-0 rounded-sm "
            style={{
              background: heatmapColor(n),
            }}
            aria-hidden="true"
          />
        ))}
        <span className="text-xs">More</span>
      </div>
    </div>
  );
}

// ── Model Breakdown ───────────────────────────────────────────────────────

function ModelBreakdown({ breakdown }: { breakdown: StatsData["modelBreakdown"] }) {
  const total = breakdown.reduce((sum, m) => sum + m.count, 0);
  if (total === 0) return null;

  return (
    <div className="bg-bg-elevated shadow-soft flex flex-col gap-2 rounded-lg p-3">
      {breakdown.map((m) => {
        const pct = total > 0 ? Math.round((m.count / total) * 100) : 0;
        const color = modelColor(m.model);
        return (
          <div key={m.model} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span
                className="text-text-primary text-xs font-semibold"
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {modelLabel(m.model)}
              </span>
              <span className="text-xs">
                {m.count} sessions · {pct}%
              </span>
            </div>
            <div className="bg-bg-card w-full overflow-hidden rounded-full" style={{ height: 6 }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: color,
                  borderRadius: "var(--radius-pill)",
                  transition: "width 400ms cubic-bezier(0.4,0,0.2,1)",
                  minWidth: pct > 0 ? 4 : 0,
                }}
                aria-label={`${modelLabel(m.model)}: ${pct}%`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Top Projects ──────────────────────────────────────────────────────────

function TopProjects({ projects }: { projects: StatsData["topProjects"] }) {
  const max = projects[0]?.sessions ?? 1;

  return (
    <div className="bg-bg-elevated shadow-soft flex flex-col gap-1.5 rounded-lg p-3">
      {projects.map((p) => {
        const pct = max > 0 ? Math.round((p.sessions / max) * 100) : 0;
        return (
          <div key={p.name} className="flex items-center gap-3">
            <span
              className="text-text-secondary truncate text-xs"
              style={{ minWidth: 0, flex: "1 1 0" }}
              title={p.name}
            >
              {p.name}
            </span>
            <div
              className="bg-bg-card flex-shrink-0 overflow-hidden rounded-full"
              style={{ width: 80, height: 4 }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "#4285f4",
                  borderRadius: "var(--radius-pill)",
                  transition: "width 400ms cubic-bezier(0.4,0,0.2,1)",
                  minWidth: pct > 0 ? 4 : 0,
                }}
                aria-label={`${p.name}: ${p.sessions} sessions`}
              />
            </div>
            <span
              className="text-text-muted flex-shrink-0 text-right text-xs font-semibold"
              style={{
                fontFamily: "var(--font-mono, monospace)",
                minWidth: 20,
              }}
            >
              {p.sessions}
            </span>
          </div>
        );
      })}
    </div>
  );
}
