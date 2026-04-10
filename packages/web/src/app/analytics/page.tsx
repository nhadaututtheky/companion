"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft,
  ChartBar,
  Lightning,
  CalendarCheck,
  Fire,
  Stack,
  CircleNotch,
  WarningCircle,
  Clock,
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
  dailyCost: Array<{ date: string; cost: number }>;
  topProjects: Array<{ name: string; sessions: number }>;
  recentSessions: Array<{
    id: string;
    name: string | null;
    model: string;
    projectSlug: string | null;
    cost: number;
    turns: number;
    tokens: number;
    durationMs: number | null;
  }>;
  avgDurationMs: number;
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

function fmtDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}h ${remainMin}m`;
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

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = "#4285f4",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4 flex-1 min-w-0"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs">{label}</span>
        <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
      </div>
      <span
        className="text-xl font-bold leading-tight"
        style={{
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
        }}
      >
        {value}
      </span>
      {sub && <span className="text-xs truncate">{sub}</span>}
    </div>
  );
}

// ── Bar Chart (CSS-only) ──────────────────────────────────────────────────

function BarChart({
  data,
  valueKey,
  formatValue,
  accentColor = "#4285f4",
}: {
  data: Array<{ date: string; [key: string]: string | number }>;
  valueKey: string;
  formatValue: (v: number) => string;
  accentColor?: string;
}) {
  const values = data.map((d) => d[valueKey] as number);
  const max = Math.max(...values, 1);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-end gap-[2px]" style={{ height: 120 }}>
        {data.map((d) => {
          const val = d[valueKey] as number;
          const pct = max > 0 ? (val / max) * 100 : 0;
          const dateLabel = d.date.slice(5); // MM-DD
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end"
              style={{ height: "100%" }}
              title={`${d.date}: ${formatValue(val)}`}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: 20,
                  height: `${Math.max(pct, 2)}%`,
                  background: val > 0 ? accentColor : "var(--color-bg-elevated)",
                  borderRadius: "3px 3px 0 0",
                  transition: "height 400ms cubic-bezier(0.4,0,0.2,1)",
                  opacity: val > 0 ? 1 : 0.3,
                }}
              />
              {data.length <= 15 && (
                <span
                  className="text-[9px] mt-1"
                  style={{
                    color: "var(--color-text-muted)",
                    transform: "rotate(-45deg)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {dateLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Session Table ─────────────────────────────────────────────────────────

function SessionTable({ sessions }: { sessions: StatsData["recentSessions"] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Session</th>
              <th className="text-left px-3 py-2 font-semibold">Model</th>
              <th className="text-right px-3 py-2 font-semibold">Turns</th>
              <th className="text-right px-3 py-2 font-semibold">Tokens</th>
              <th className="text-right px-3 py-2 font-semibold">Cost</th>
              <th className="text-right px-3 py-2 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                className="transition-colors"
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <td className="px-3 py-2">
                  <Link href={`/sessions/${s.id}`} className="hover:underline">
                    {s.name ?? s.id.slice(0, 8)}
                  </Link>
                  {s.projectSlug && <span className="ml-1.5 text-[10px]">{s.projectSlug}</span>}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{
                      background: `${modelColor(s.model)}20`,
                      color: modelColor(s.model),
                    }}
                  >
                    {modelLabel(s.model)}
                  </span>
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{
                    color: "var(--color-text-secondary)",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {s.turns}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{
                    color: "var(--color-text-secondary)",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {fmtTokens(s.tokens)}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 600,
                  }}
                >
                  {fmtCost(s.cost)}
                </td>
                <td
                  className="px-3 py-2 text-right"
                  style={{
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {fmtDuration(s.durationMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.stats.get();
      if (res.data) setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <Link
          href="/"
          className="p-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--color-bg-elevated)]"
          aria-label="Back to home"
        >
          <ArrowLeft size={16} weight="bold" />
        </Link>
        <ChartBar size={18} weight="bold" style={{ color: "#4285f4" }} aria-hidden="true" />
        <span className="text-base font-semibold">Analytics</span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-5 max-w-5xl mx-auto w-full">
        {loading && (
          <div className="flex items-center justify-center py-20 gap-2">
            <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading analytics...</span>
          </div>
        )}

        {error && (
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: "#EA433515", color: "#EA4335", border: "1px solid #EA433530" }}
          >
            <WarningCircle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {data && data.totalSessions === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ChartBar size={40} weight="light" style={{ color: "var(--color-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No sessions yet — start a session to see cost analytics
            </p>
          </div>
        )}

        {data && data.totalSessions > 0 && (
          <div className="flex flex-col gap-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Today"
                value={String(data.today.sessions)}
                sub={`${fmtCost(data.today.cost)} · ${fmtTokens(data.today.tokens)} tok`}
                icon={<Lightning size={14} weight="fill" />}
                accent="#FBBC04"
              />
              <KpiCard
                label="This Week"
                value={String(data.week.sessions)}
                sub={`${fmtCost(data.week.cost)} · ${fmtTokens(data.week.tokens)} tok`}
                icon={<CalendarCheck size={14} weight="fill" />}
                accent="#34A853"
              />
              <KpiCard
                label="Streak"
                value={`${data.streak}d`}
                sub={data.streak === 1 ? "1 day active" : `${data.streak} days in a row`}
                icon={<Fire size={14} weight="fill" />}
                accent="#EA4335"
              />
              <KpiCard
                label="All-time"
                value={String(data.totalSessions)}
                sub="total sessions"
                icon={<Stack size={14} weight="fill" />}
                accent="#4285f4"
              />
              <KpiCard
                label="Avg Duration"
                value={fmtDuration(data.avgDurationMs)}
                sub="per session (30d)"
                icon={<Clock size={14} weight="fill" />}
                accent="#9b59b6"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Daily Sessions (30d)
                </span>
                <BarChart
                  data={data.dailyActivity}
                  valueKey="sessions"
                  formatValue={(v) => `${v} sessions`}
                  accentColor="#4285f4"
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Daily Cost (30d)
                </span>
                <BarChart
                  data={data.dailyCost}
                  valueKey="cost"
                  formatValue={fmtCost}
                  accentColor="#34A853"
                />
              </div>
            </div>

            {/* Model breakdown + Top projects */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.modelBreakdown.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Model Usage (30d)
                  </span>
                  <div
                    className="flex flex-col gap-3 rounded-xl p-4"
                    style={{
                      background: "var(--color-bg-card)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {data.modelBreakdown.map((m) => {
                      const total = data.modelBreakdown.reduce((s, x) => s + x.count, 0);
                      const pct = total > 0 ? Math.round((m.count / total) * 100) : 0;
                      return (
                        <div key={m.model} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs font-semibold"
                              style={{ color: modelColor(m.model) }}
                            >
                              {modelLabel(m.model)}
                            </span>
                            <span className="text-xs">
                              {m.count} sessions · {fmtTokens(m.tokens)} tok · {pct}%
                            </span>
                          </div>
                          <div
                            className="w-full rounded-full overflow-hidden"
                            style={{ height: 6, background: "var(--color-bg-elevated)" }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: modelColor(m.model),
                                borderRadius: 9999,
                                transition: "width 400ms cubic-bezier(0.4,0,0.2,1)",
                                minWidth: pct > 0 ? 4 : 0,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.topProjects.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Top Projects (30d)
                  </span>
                  <div
                    className="flex flex-col gap-2 rounded-xl p-4"
                    style={{
                      background: "var(--color-bg-card)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {data.topProjects.map((p) => {
                      const max = data.topProjects[0]?.sessions ?? 1;
                      const pct = max > 0 ? Math.round((p.sessions / max) * 100) : 0;
                      return (
                        <div key={p.name} className="flex items-center gap-3">
                          <span className="text-xs truncate flex-1" title={p.name}>
                            {p.name}
                          </span>
                          <div
                            className="flex-shrink-0 rounded-full overflow-hidden"
                            style={{ width: 80, height: 5, background: "var(--color-bg-elevated)" }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: "#4285f4",
                                borderRadius: 9999,
                                minWidth: pct > 0 ? 4 : 0,
                              }}
                            />
                          </div>
                          <span
                            className="text-xs font-semibold flex-shrink-0"
                            style={{
                              color: "var(--color-text-muted)",
                              fontFamily: "var(--font-mono, monospace)",
                              minWidth: 20,
                              textAlign: "right",
                            }}
                          >
                            {p.sessions}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Recent sessions table */}
            {data.recentSessions.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Recent Sessions
                </span>
                <SessionTable sessions={data.recentSessions} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
