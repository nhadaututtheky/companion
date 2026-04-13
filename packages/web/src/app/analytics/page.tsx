"use client";

import React, { useEffect, useState, useCallback } from "react";
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
  Globe,
  TelegramLogo,
  Terminal,
  Desktop,
  Code,
  CaretDown,
  CaretRight,
  File,
  FilePlus,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface RecentSession {
  id: string;
  name: string | null;
  model: string;
  projectSlug: string | null;
  source: string;
  startedAt: number;
  cost: number;
  turns: number;
  tokens: number;
  durationMs: number | null;
  rtkTokensSaved: number;
  filesModified: string[];
  filesCreated: string[];
}

interface RTKSummary {
  totalTokensSaved: number;
  totalCompressions: number;
  totalCacheHits: number;
  cacheHitRate: number;
  estimatedCostSaved: number;
}

interface StatsData {
  today: { sessions: number; tokens: number; cost: number };
  week: { sessions: number; tokens: number; cost: number };
  streak: number;
  totalSessions: number;
  modelBreakdown: Array<{ model: string; count: number; tokens: number }>;
  dailyActivity: Array<{ date: string; sessions: number; tokens: number }>;
  dailyCost: Array<{ date: string; cost: number }>;
  topProjects: Array<{ name: string; sessions: number }>;
  recentSessions: RecentSession[];
  avgDurationMs: number;
  rtkSummary: RTKSummary;
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
    <div className="shadow-soft bg-bg-card flex min-w-0 flex-1 flex-col gap-1 rounded-xl p-4">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs">{label}</span>
        <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
      </div>
      <span
        className="text-text-primary text-xl font-bold leading-tight"
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
    <div className="shadow-soft bg-bg-card rounded-xl p-4">
      <div className="flex items-end gap-[2px]" style={{ height: 120 }}>
        {data.map((d) => {
          const val = d[valueKey] as number;
          const pct = max > 0 ? (val / max) * 100 : 0;
          const dateLabel = d.date.slice(5); // MM-DD
          return (
            <div
              key={d.date}
              className="flex flex-1 flex-col items-center justify-end"
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
                  className="text-text-muted mt-1 whitespace-nowrap text-[9px]"
                  style={{
                    transform: "rotate(-45deg)",
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

// ── Source Badge ──────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { icon: typeof Globe; label: string; color: string }> = {
  web: { icon: Globe, label: "Web", color: "#4285f4" },
  telegram: { icon: TelegramLogo, label: "Telegram", color: "#29B6F6" },
  cli: { icon: Terminal, label: "CLI", color: "#34A853" },
  desktop: { icon: Desktop, label: "Desktop", color: "#a78bfa" },
  api: { icon: Code, label: "API", color: "#94a3b8" },
};

function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.api!;
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: `${config.color}15`, color: config.color }}
    >
      <Icon size={10} weight="bold" aria-hidden="true" />
      {config.label}
    </span>
  );
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${min}`;
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

// ── Session Table ─────────────────────────────────────────────────────────

function SessionTable({ sessions }: { sessions: RecentSession[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="shadow-soft bg-bg-card overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" style={{ width: 28 }} />
              <th className="px-3 py-2 text-left font-semibold">Start</th>
              <th className="px-3 py-2 text-left font-semibold">Source</th>
              <th className="px-3 py-2 text-left font-semibold">Session</th>
              <th className="px-3 py-2 text-left font-semibold">Model</th>
              <th className="px-3 py-2 text-right font-semibold">Turns</th>
              <th className="px-3 py-2 text-right font-semibold">Tokens</th>
              <th className="px-3 py-2 text-right font-semibold">Cost</th>
              <th className="px-3 py-2 text-right font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const isExpanded = expandedId === s.id;
              const totalFiles = s.filesModified.length + s.filesCreated.length;
              return (
                <React.Fragment key={s.id}>
                  <tr
                    className="cursor-pointer transition-colors"
                    style={{
                      borderTop: "1px solid var(--color-border)",
                      background: isExpanded ? "var(--color-bg-elevated)" : undefined,
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  >
                    <td className="text-text-muted px-2 py-2 text-center">
                      {isExpanded ? (
                        <CaretDown size={12} weight="bold" />
                      ) : (
                        <CaretRight size={12} weight="bold" />
                      )}
                    </td>
                    <td
                      className="text-text-secondary whitespace-nowrap px-3 py-2"
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {fmtTime(s.startedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <SourceBadge source={s.source} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{s.name ?? s.id.slice(0, 8)}</span>
                      {s.projectSlug && (
                        <span className="text-text-muted ml-1.5 text-[10px]">{s.projectSlug}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: `${modelColor(s.model)}20`,
                          color: modelColor(s.model),
                        }}
                      >
                        {modelLabel(s.model)}
                      </span>
                    </td>
                    <td
                      className="text-text-secondary px-3 py-2 text-right"
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {s.turns}
                    </td>
                    <td
                      className="text-text-secondary px-3 py-2 text-right"
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {fmtTokens(s.tokens)}
                    </td>
                    <td
                      className="text-text-primary px-3 py-2 text-right font-semibold"
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {fmtCost(s.cost)}
                    </td>
                    <td
                      className="text-text-muted px-3 py-2 text-right"
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {fmtDuration(s.durationMs)}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr>
                      <td
                        colSpan={9}
                        className="bg-bg-elevated px-4 py-3"
                        style={{
                          borderTop: "1px solid var(--color-border)",
                        }}
                      >
                        <div className="flex gap-6">
                          {/* Files section */}
                          <div className="min-w-0 flex-1">
                            <p className="text-text-muted mb-1.5 text-[10px] font-semibold uppercase tracking-wide">
                              Files ({totalFiles})
                            </p>
                            {totalFiles === 0 ? (
                              <p className="text-text-muted text-xs">No file changes</p>
                            ) : (
                              <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                                {s.filesModified.map((f) => (
                                  <div
                                    key={`m-${f}`}
                                    className="text-text-secondary flex items-center gap-1.5 text-xs"
                                  >
                                    <File
                                      size={10}
                                      weight="bold"
                                      className="shrink-0"
                                      style={{ color: "#FBBC04" }}
                                      aria-hidden="true"
                                    />
                                    <span className="truncate" title={f}>
                                      {basename(f)}
                                    </span>
                                  </div>
                                ))}
                                {s.filesCreated.map((f) => (
                                  <div
                                    key={`c-${f}`}
                                    className="text-text-secondary flex items-center gap-1.5 text-xs"
                                  >
                                    <FilePlus
                                      size={10}
                                      weight="bold"
                                      className="shrink-0"
                                      style={{ color: "#34A853" }}
                                      aria-hidden="true"
                                    />
                                    <span className="truncate" title={f}>
                                      {basename(f)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* RTK section */}
                          {s.rtkTokensSaved > 0 && (
                            <div className="flex-shrink-0">
                              <p className="text-text-muted mb-1.5 text-[10px] font-semibold uppercase tracking-wide">
                                RTK Savings
                              </p>
                              <p
                                className="font-mono text-sm font-bold"
                                style={{ color: "#34A853" }}
                              >
                                {fmtTokens(s.rtkTokensSaved)} tokens
                              </p>
                            </div>
                          )}

                          {/* Quick link */}
                          <div className="flex flex-shrink-0 items-end">
                            <Link
                              href={`/sessions/${s.id}`}
                              className="text-text-muted border-border cursor-pointer rounded-lg border px-2.5 py-1 text-xs transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Open session →
                            </Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Feature Data Types ───────────────────────────────────────────────────

interface FeatureData {
  rtk: {
    daily: Array<{ date: string; tokensSaved: number; compressions: number }>;
    totalTokensSaved: number;
    totalCompressions: number;
    cacheHitRate: number;
    estimatedCostSaved: number;
  };
  wiki: {
    domains: Array<{
      slug: string;
      name: string;
      articleCount: number;
      totalTokens: number;
      staleCount: number;
      lastCompiledAt: string | null;
      rawPending: number;
    }>;
    totalArticles: number;
    totalTokens: number;
  };
  codegraph: {
    projects: Array<{
      slug: string;
      files: number;
      nodes: number;
      edges: number;
      lastScannedAt: string | null;
      coveragePercent: number;
    }>;
  };
  context: {
    totalInjections: number;
    totalTokens: number;
    typeBreakdown: Array<{ type: string; count: number; tokens: number }>;
    daily: Array<{ date: string; injections: number; tokens: number }>;
    topSessions: Array<{ sessionId: string; injections: number; tokens: number }>;
  };
}

type AnalyticsTab = "overview" | "rtk" | "wiki" | "codegraph" | "context";

const TABS: Array<{ id: AnalyticsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rtk", label: "RTK" },
  { id: "wiki", label: "Wiki KB" },
  { id: "codegraph", label: "CodeGraph" },
  { id: "context", label: "AI Context" },
];

// ── RTK Tab ──────────────────────────────────────────────────────────────

function RTKTab({ data }: { data: FeatureData["rtk"] }) {
  if (data.totalTokensSaved === 0 && data.totalCompressions === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Lightning size={40} weight="light" className="text-text-muted" />
        <p className="text-text-muted text-sm">RTK has not processed any sessions yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Tokens Saved"
          value={fmtTokens(data.totalTokensSaved)}
          sub="last 30 days"
          icon={<Lightning size={14} weight="fill" />}
          accent="#34A853"
        />
        <KpiCard
          label="Est. Cost Saved"
          value={fmtCost(data.estimatedCostSaved)}
          sub="based on model rates"
          icon={<Lightning size={14} weight="fill" />}
          accent="#4285f4"
        />
        <KpiCard
          label="Compressions"
          value={String(data.totalCompressions)}
          sub="total transforms"
          icon={<Stack size={14} weight="fill" />}
          accent="#FBBC04"
        />
        <KpiCard
          label="Cache Hit Rate"
          value={`${data.cacheHitRate}%`}
          sub="dedup efficiency"
          icon={<Fire size={14} weight="fill" />}
          accent="#a78bfa"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Daily Token Savings (30d)
        </span>
        <BarChart
          data={data.daily}
          valueKey="tokensSaved"
          formatValue={(v) => fmtTokens(v)}
          accentColor="#34A853"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Daily Compressions (30d)
        </span>
        <BarChart
          data={data.daily}
          valueKey="compressions"
          formatValue={(v) => `${v} compressions`}
          accentColor="#FBBC04"
        />
      </div>

      <p className="text-text-muted text-xs">Per-strategy breakdown coming in a future update.</p>
    </div>
  );
}

// ── Wiki KB Tab ──────────────────────────────────────────────────────────

function WikiTab({ data }: { data: FeatureData["wiki"] }) {
  if (data.domains.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Stack size={40} weight="light" className="text-text-muted" />
        <p className="text-text-muted text-sm">No Wiki KB domains configured</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Domains"
          value={String(data.domains.length)}
          icon={<Stack size={14} weight="fill" />}
          accent="#4285f4"
        />
        <KpiCard
          label="Articles"
          value={String(data.totalArticles)}
          sub={`${fmtTokens(data.totalTokens)} tokens stored`}
          icon={<Fire size={14} weight="fill" />}
          accent="#34A853"
        />
        <KpiCard
          label="Stale"
          value={String(data.domains.reduce((s, d) => s + d.staleCount, 0))}
          sub="need recompilation"
          icon={<WarningCircle size={14} weight="fill" />}
          accent={data.domains.some((d) => d.staleCount > 0) ? "#FBBC04" : "#94a3b8"}
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide">Domains</span>
        {data.domains.map((d) => (
          <div
            key={d.slug}
            className="bg-bg-card flex items-center gap-4 rounded-xl p-3"
            style={{
              border: `1px solid ${d.staleCount > 0 ? "#FBBC0440" : "var(--color-border)"}`,
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{d.name}</p>
              <p className="text-text-muted text-xs">
                {d.articleCount} articles · {fmtTokens(d.totalTokens)} tokens
              </p>
            </div>
            {d.staleCount > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "#FBBC0420", color: "#FBBC04" }}
              >
                {d.staleCount} stale
              </span>
            )}
            {d.rawPending > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "#4285f420", color: "#4285f4" }}
              >
                {d.rawPending} pending
              </span>
            )}
            <span className="text-text-muted flex-shrink-0 font-mono text-[10px]">
              {d.lastCompiledAt ? new Date(d.lastCompiledAt).toLocaleDateString() : "never"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CodeGraph Tab ────────────────────────────────────────────────────────

function CodeGraphTab({ data }: { data: FeatureData["codegraph"] }) {
  if (data.projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <ChartBar size={40} weight="light" className="text-text-muted" />
        <p className="text-text-muted text-sm">Run a CodeGraph scan to see intelligence metrics</p>
      </div>
    );
  }

  const totalNodes = data.projects.reduce((s, p) => s + p.nodes, 0);
  const totalEdges = data.projects.reduce((s, p) => s + p.edges, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Projects"
          value={String(data.projects.length)}
          sub="scanned"
          icon={<Stack size={14} weight="fill" />}
          accent="#4285f4"
        />
        <KpiCard
          label="Symbols"
          value={fmtTokens(totalNodes)}
          sub="functions, classes, types"
          icon={<ChartBar size={14} weight="fill" />}
          accent="#34A853"
        />
        <KpiCard
          label="Relationships"
          value={fmtTokens(totalEdges)}
          sub="imports, calls, extends"
          icon={<Fire size={14} weight="fill" />}
          accent="#a78bfa"
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide">Projects</span>
        {data.projects.map((p) => (
          <div
            key={p.slug}
            className="shadow-soft bg-bg-card flex items-center gap-4 rounded-xl p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{p.slug}</p>
              <p className="text-text-muted text-xs">
                {p.files} files · {p.nodes} symbols · {p.edges} relationships
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <div
                className="bg-bg-elevated overflow-hidden rounded-full"
                style={{ width: 60, height: 5 }}
              >
                <div
                  style={{
                    width: `${p.coveragePercent}%`,
                    height: "100%",
                    background:
                      p.coveragePercent > 70
                        ? "#34A853"
                        : p.coveragePercent > 40
                          ? "#FBBC04"
                          : "#EA4335",
                    borderRadius: 9999,
                    minWidth: p.coveragePercent > 0 ? 4 : 0,
                  }}
                />
              </div>
              <span
                className="text-right font-mono text-[10px] font-semibold"
                style={{
                  color:
                    p.coveragePercent > 70
                      ? "#34A853"
                      : p.coveragePercent > 40
                        ? "#FBBC04"
                        : "#EA4335",
                  minWidth: 28,
                }}
              >
                {p.coveragePercent}%
              </span>
            </div>
            <span className="text-text-muted flex-shrink-0 font-mono text-[10px]">
              {p.lastScannedAt ? new Date(p.lastScannedAt).toLocaleDateString() : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Context Tab ───────────────────────────────────────────────────────

const INJECTION_LABELS: Record<string, string> = {
  project_map: "Project Map",
  message_context: "Message Context",
  plan_review: "Plan Review",
  break_check: "Break Check",
  web_docs: "Web Docs",
  activity_feed: "Activity Feed",
};

const INJECTION_COLORS: Record<string, string> = {
  project_map: "#4285f4",
  message_context: "#34A853",
  plan_review: "#FBBC04",
  break_check: "#EA4335",
  web_docs: "#a78bfa",
  activity_feed: "#06b6d4",
};

function ContextTab({ data }: { data: FeatureData["context"] }) {
  if (data.totalInjections === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Lightning size={40} weight="light" className="text-text-muted" />
        <p className="text-text-muted text-sm">
          No context injections recorded yet. Injections are logged when CodeGraph enriches agent
          messages.
        </p>
      </div>
    );
  }

  const avgTokensPerInjection =
    data.totalInjections > 0 ? Math.round(data.totalTokens / data.totalInjections) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Injections"
          value={fmtTokens(data.totalInjections)}
          sub="last 30 days"
          icon={<Lightning size={14} weight="fill" />}
          accent="#4285f4"
        />
        <KpiCard
          label="Tokens Injected"
          value={fmtTokens(data.totalTokens)}
          sub="total context added"
          icon={<Stack size={14} weight="fill" />}
          accent="#34A853"
        />
        <KpiCard
          label="Avg per Injection"
          value={`${avgTokensPerInjection}`}
          sub="tokens"
          icon={<ChartBar size={14} weight="fill" />}
          accent="#a78bfa"
        />
      </div>

      {/* Type breakdown */}
      {data.typeBreakdown.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide">By Type</span>
          {data.typeBreakdown.map((t) => {
            const maxCount = data.typeBreakdown[0]?.count ?? 1;
            const pct = Math.round((t.count / maxCount) * 100);
            const color = INJECTION_COLORS[t.type] ?? "#4285f4";
            return (
              <div
                key={t.type}
                className="shadow-soft bg-bg-card flex items-center gap-3 rounded-xl p-3"
              >
                <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{INJECTION_LABELS[t.type] ?? t.type}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div
                      className="bg-bg-elevated flex-1 overflow-hidden rounded-full"
                      style={{ height: 4 }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: color,
                          borderRadius: 9999,
                          minWidth: pct > 0 ? 4 : 0,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end">
                  <span className="font-mono text-sm font-bold">{t.count}</span>
                  <span className="text-text-muted font-mono text-[10px]">
                    {fmtTokens(t.tokens)} tok
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Daily chart */}
      <BarChart
        data={data.daily}
        valueKey="injections"
        formatValue={(v) => `${v} injections`}
        accentColor="#4285f4"
      />

      {/* Top sessions */}
      {data.topSessions.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide">Top Sessions</span>
          {data.topSessions.slice(0, 5).map((s) => (
            <div
              key={s.sessionId}
              className="shadow-soft bg-bg-card flex items-center gap-3 rounded-xl p-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/sessions/${s.sessionId}`}
                  className="font-mono text-sm hover:underline"
                  style={{ color: "#4285f4" }}
                >
                  {s.sessionId.slice(0, 12)}...
                </Link>
              </div>
              <span className="font-mono text-sm font-bold">{s.injections}</span>
              <span className="text-text-muted font-mono text-[10px]">
                {fmtTokens(s.tokens)} tok
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [featureData, setFeatureData] = useState<FeatureData | null>(null);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [loading, setLoading] = useState(true);
  const [featureLoading, setFeatureLoading] = useState(false);
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

  const fetchFeatures = useCallback(async () => {
    if (featureData) return;
    setFeatureLoading(true);
    try {
      const res = await api.stats.features();
      if (res.data) setFeatureData(res.data);
    } catch {
      // Feature data is optional — don't block page
    } finally {
      setFeatureLoading(false);
    }
  }, [featureData]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab !== "overview") fetchFeatures();
  }, [activeTab, fetchFeatures]);

  return (
    <div
      className="text-text-primary flex min-h-screen flex-col"
      style={{ background: "var(--color-bg-base)" }}
    >
      {/* Header */}
      <header
        className="flex flex-shrink-0 items-center gap-3 px-6 py-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <Link
          href="/"
          className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
          aria-label="Back to home"
        >
          <ArrowLeft size={16} weight="bold" />
        </Link>
        <ChartBar size={18} weight="bold" style={{ color: "#4285f4" }} aria-hidden="true" />
        <span className="text-base font-semibold">Analytics</span>
      </header>

      {/* Tab bar */}
      <nav
        className="flex flex-shrink-0 gap-0 px-6"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative cursor-pointer px-4 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: activeTab === tab.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
              background: "transparent",
              border: "none",
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span
                className="absolute bottom-0 left-2 right-2"
                style={{ height: 2, background: "#4285f4", borderRadius: 1 }}
              />
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-5">
        {loading && activeTab === "overview" && (
          <div className="flex items-center justify-center gap-2 py-20">
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

        {activeTab === "overview" && data && data.totalSessions === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <ChartBar size={40} weight="light" className="text-text-muted" />
            <p className="text-text-muted text-sm">
              No sessions yet — start a session to see cost analytics
            </p>
          </div>
        )}

        {activeTab === "overview" && data && data.totalSessions > 0 && (
          <div className="flex flex-col gap-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
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
              {data.rtkSummary.totalTokensSaved > 0 && (
                <KpiCard
                  label="RTK Saved"
                  value={fmtCost(data.rtkSummary.estimatedCostSaved)}
                  sub={`${fmtTokens(data.rtkSummary.totalTokensSaved)} tokens · ${data.rtkSummary.cacheHitRate}% cache`}
                  icon={<Lightning size={14} weight="fill" />}
                  accent="#34A853"
                />
              )}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.modelBreakdown.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Model Usage (30d)
                  </span>
                  <div className="shadow-soft bg-bg-card flex flex-col gap-3 rounded-xl p-4">
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
                            className="bg-bg-elevated w-full overflow-hidden rounded-full"
                            style={{ height: 6 }}
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
                  <div className="shadow-soft bg-bg-card flex flex-col gap-2 rounded-xl p-4">
                    {data.topProjects.map((p) => {
                      const max = data.topProjects[0]?.sessions ?? 1;
                      const pct = max > 0 ? Math.round((p.sessions / max) * 100) : 0;
                      return (
                        <div key={p.name} className="flex items-center gap-3">
                          <span className="flex-1 truncate text-xs" title={p.name}>
                            {p.name}
                          </span>
                          <div
                            className="bg-bg-elevated flex-shrink-0 overflow-hidden rounded-full"
                            style={{ width: 80, height: 5 }}
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

        {/* Feature tabs */}
        {activeTab !== "overview" && featureLoading && (
          <div className="flex items-center justify-center gap-2 py-20">
            <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading feature data...</span>
          </div>
        )}

        {activeTab === "rtk" && featureData && <RTKTab data={featureData.rtk} />}
        {activeTab === "wiki" && featureData && <WikiTab data={featureData.wiki} />}
        {activeTab === "codegraph" && featureData && <CodeGraphTab data={featureData.codegraph} />}
        {activeTab === "context" && featureData?.context && (
          <ContextTab data={featureData.context} />
        )}
      </main>
    </div>
  );
}
