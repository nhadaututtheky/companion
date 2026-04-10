"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  ChartBar,
  Lightning,
  CalendarCheck,
  Fire,
  Stack,
  ArrowRight,
  CircleNotch,
  X,
} from "@phosphor-icons/react";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import Link from "next/link";

const ACTIVE_STATUSES = ["starting", "running", "waiting", "idle", "busy", "error"];

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

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
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

// ── Stats Watermark (collapsed pill) ──────────────────────────────────────

export function BottomStatsBar() {
  const sessions = useSessionStore((s) => s.sessions);
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { totalCost } = useMemo(() => {
    const active = Object.values(sessions).filter((s) => ACTIVE_STATUSES.includes(s.status));
    const cost = active.reduce((sum, s) => sum + (s.state?.total_cost_usd ?? 0), 0);
    return { totalCost: cost };
  }, [sessions]);

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

  // Fetch stats when expanding
  useEffect(() => {
    if (expanded && !data) fetchStats();
  }, [expanded, data, fetchStats]);

  // Click outside to collapse
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  // Don't render if no active sessions
  const hasActive = Object.values(sessions).some((s) => ACTIVE_STATUSES.includes(s.status));
  if (!hasActive) return null;

  return (
    <div
      ref={containerRef}
      className="hidden sm:flex"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: expanded ? 45 : 1,
        pointerEvents: expanded ? "auto" : undefined,
        transition: "z-index 0ms",
      }}
    >
      {expanded ? (
        /* ── Expanded stats panel ── */
        <div
          className="flex items-stretch"
          style={{
            background: "var(--glass-bg-heavy)",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-float)",
            padding: "2px 6px",
            maxWidth: "90vw",
            animation: "slideUpFade 200ms ease forwards",
          }}
        >
          {/* Title */}
          <div className="flex items-center gap-1.5 px-3 py-2">
            <ChartBar size={14} weight="bold" style={{ color: "var(--color-accent)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Stats
            </span>
          </div>

          <Sep />

          {loading && (
            <div className="flex items-center gap-2 px-4 py-2">
              <CircleNotch
                size={14}
                className="animate-spin"
                style={{ color: "var(--color-text-muted)" }}
              />
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Loading...
              </span>
            </div>
          )}

          {data && (
            <>
              <StatBlock
                label="Today"
                value={String(data.today.sessions)}
                sub={`${fmtCost(data.today.cost)} · ${fmtTokens(data.today.tokens)} tok`}
                accent="#FBBC04"
              />
              <Sep />
              <StatBlock
                label="Week"
                value={String(data.week.sessions)}
                sub={`${fmtCost(data.week.cost)} · ${fmtTokens(data.week.tokens)} tok`}
                accent="#34A853"
              />
              <Sep />
              <StatBlock label="Streak" value={`${data.streak}d`} accent="#EA4335" />
              <Sep />
              <StatBlock label="All-time" value={String(data.totalSessions)} />
              <Sep />

              {data.dailyActivity.length > 0 && (
                <>
                  <div className="flex flex-col items-center gap-1 px-3 py-2">
                    <span
                      className="text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      14-day
                    </span>
                    <div className="flex gap-[2px]">
                      {data.dailyActivity.slice(-14).map((day) => (
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
                  <Sep />
                </>
              )}

              {data.modelBreakdown.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    {data.modelBreakdown.map((m) => {
                      const total = data.modelBreakdown.reduce((s, x) => s + x.count, 0);
                      const pct = total > 0 ? Math.round((m.count / total) * 100) : 0;
                      return (
                        <div
                          key={m.model}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold"
                          style={{
                            borderRadius: "var(--radius-pill)",
                            background: `color-mix(in srgb, ${modelColor(m.model)} 12%, transparent)`,
                            color: modelColor(m.model),
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {modelLabel(m.model)} <span style={{ opacity: 0.7 }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                  <Sep />
                </>
              )}
            </>
          )}

          <Link
            href="/analytics"
            className="flex items-center gap-1 px-3 py-2 text-xs font-medium cursor-pointer"
            style={{ color: "var(--color-accent)" }}
          >
            Full <ArrowRight size={10} weight="bold" />
          </Link>

          <Sep />

          <button
            onClick={() => setExpanded(false)}
            className="flex items-center justify-center px-2 py-2 cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close stats"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      ) : (
        /* ── Collapsed watermark pill ── */
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-all"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-pill)",
            opacity: 0.4,
            transition: "opacity 200ms ease, transform 200ms ease",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.4";
            e.currentTarget.style.transform = "scale(1)";
          }}
          title="Click to view stats"
          aria-label="Session stats"
        >
          <ChartBar size={12} weight="bold" />
          {fmtCost(totalCost)}
        </button>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-2 min-w-[80px]">
      <span
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-lg font-bold tabular-nums leading-none"
        style={{ fontFamily: "var(--font-mono)", color: accent ?? "var(--color-text-primary)" }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function Sep() {
  return <span className="w-px self-stretch my-2" style={{ background: "var(--glass-border)" }} />;
}
