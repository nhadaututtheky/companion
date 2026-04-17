"use client";

import { useState, useEffect, useMemo } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { accounts as accountsApi, type AccountUsage, type HeatmapBucket } from "@/lib/api/accounts";

// ── Helpers ─────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(usd);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  }
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function resetLabel(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  return `Resets in ${formatDuration(ms)}`;
}

// ── Heatmap logic ───────────────────────────────────────────────────

interface HeatmapCell {
  date: string;
  cost: number;
  sessions: number;
  tokens: number;
  level: 0 | 1 | 2 | 3 | 4;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildHeatmapGrid(buckets: HeatmapBucket[], weeks = 53): HeatmapCell[][] {
  const byDate = new Map(buckets.map((b) => [b.date, b]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Percentile thresholds with uniform-cost collapse guard.
  const costs = buckets.map((b) => b.cost).filter((c) => c > 0).sort((a, b) => a - b);
  const pct = (p: number) => (costs.length === 0 ? 0 : costs[Math.floor(costs.length * p)] ?? 0);
  const p25 = pct(0.25);
  const p50 = pct(0.5);
  const p75 = pct(0.75);
  const p90 = pct(0.9);
  const uniform = costs.length > 0 && p25 === p90; // all active days have identical cost

  const totalDays = weeks * 7;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (totalDays - 1));
  startDate.setDate(startDate.getDate() - startDate.getDay()); // shift back to Sunday

  const grid: HeatmapCell[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const col: HeatmapCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + w * 7 + d);
      if (cellDate > today) break;
      const key = localDateKey(cellDate);
      const bucket = byDate.get(key);
      const cost = bucket?.cost ?? 0;
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (cost > 0) {
        if (uniform) level = 2; // medium shade when all days equal
        else if (cost >= p90) level = 4;
        else if (cost >= p75) level = 3;
        else if (cost >= p50) level = 2;
        else if (cost >= p25) level = 1;
        else level = 1;
      }
      col.push({
        date: key,
        cost,
        sessions: bucket?.sessions ?? 0,
        tokens: bucket?.tokens ?? 0,
        level,
      });
    }
    grid.push(col);
  }
  return grid;
}

const LEVEL_ALPHA = [0.04, 0.25, 0.5, 0.75, 1.0]; // per level

// ── Sub-components ──────────────────────────────────────────────────

function Heatmap({ buckets }: { buckets: HeatmapBucket[] }) {
  const grid = useMemo(() => buildHeatmapGrid(buckets, 53), [buckets]);
  const [hover, setHover] = useState<HeatmapCell | null>(null);

  // Month labels — show label at first week of each month
  const monthLabels = useMemo(() => {
    const labels: Array<{ week: number; label: string }> = [];
    let lastMonth = -1;
    grid.forEach((col, w) => {
      if (col.length === 0) return;
      const d = new Date(col[0]!.date);
      const m = d.getMonth();
      if (m !== lastMonth) {
        labels.push({ week: w, label: d.toLocaleString("en-US", { month: "short" }) });
        lastMonth = m;
      }
    });
    return labels;
  }, [grid]);

  const CELL = 11;
  const GAP = 3;
  const DAY_LABEL_W = 24;

  return (
    <div className="relative">
      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded px-2 py-1 text-xs shadow-lg"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--glass-border)",
            top: -36,
            left: DAY_LABEL_W,
            whiteSpace: "nowrap",
          }}
        >
          <span className="font-medium">
            {new Date(hover.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span className="ml-2" style={{ color: "var(--color-text-muted)" }}>
            {hover.cost > 0
              ? `${formatCost(hover.cost)} · ${hover.sessions} sessions · ${formatTokens(hover.tokens)} tokens`
              : "No activity"}
          </span>
        </div>
      )}

      <div className="flex">
        {/* Day labels */}
        <div
          className="flex shrink-0 flex-col"
          style={{ width: DAY_LABEL_W, gap: GAP, paddingTop: 18 }}
        >
          {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
            <div
              key={i}
              className="text-xs"
              style={{
                height: CELL,
                lineHeight: `${CELL}px`,
                color: "var(--color-text-muted)",
                fontSize: 9,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative">
            {/* Month labels */}
            <div className="relative" style={{ height: 14 }}>
              {monthLabels.map((ml) => (
                <span
                  key={ml.week}
                  className="absolute text-xs"
                  style={{
                    left: ml.week * (CELL + GAP),
                    fontSize: 9,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {ml.label}
                </span>
              ))}
            </div>

            {/* Cells */}
            <div
              className="flex"
              style={{ gap: GAP }}
              role="grid"
              aria-label="Daily activity heatmap"
            >
              {grid.map((col, w) => (
                <div key={w} className="flex flex-col" role="row" style={{ gap: GAP }}>
                  {col.map((cell) => {
                    const label =
                      cell.cost > 0
                        ? `${cell.date}: ${formatCost(cell.cost)}, ${cell.sessions} sessions, ${formatTokens(cell.tokens)} tokens`
                        : `${cell.date}: no activity`;
                    return (
                      <button
                        type="button"
                        key={cell.date}
                        role="gridcell"
                        aria-label={label}
                        title={label}
                        onMouseEnter={() => setHover(cell)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(cell)}
                        onBlur={() => setHover(null)}
                        className="cursor-default p-0"
                        style={{
                          width: CELL,
                          height: CELL,
                          borderRadius: 2,
                          background:
                            cell.level === 0
                              ? "var(--glass-bg)"
                              : `color-mix(in srgb, var(--color-accent) ${LEVEL_ALPHA[cell.level]! * 100}%, transparent)`,
                          border:
                            cell.level === 0
                              ? "1px solid color-mix(in srgb, var(--color-text-muted) 15%, transparent)"
                              : "none",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-2 flex items-center justify-end gap-1 text-xs">
              <span style={{ color: "var(--color-text-muted)", fontSize: 9 }}>Less</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <div
                  key={l}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 2,
                    background:
                      l === 0
                        ? "var(--glass-bg)"
                        : `color-mix(in srgb, var(--color-accent) ${LEVEL_ALPHA[l]! * 100}%, transparent)`,
                    border:
                      l === 0
                        ? "1px solid color-mix(in srgb, var(--color-text-muted) 15%, transparent)"
                        : "none",
                  }}
                />
              ))}
              <span style={{ color: "var(--color-text-muted)", fontSize: 9 }}>More</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  sublabel,
  value,
  max,
  format,
}: {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  format: "cost" | "tokens";
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const display = format === "cost" ? formatCost(value) : formatTokens(value);
  const displayMax = format === "cost" ? formatCost(max) : formatTokens(max);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          {sublabel && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {sublabel}
            </span>
          )}
        </div>
        <span
          className="text-xs"
          style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
        >
          {display} / {displayMax}
        </span>
      </div>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--glass-bg-heavy)" }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "var(--color-accent)",
          }}
        />
      </div>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────

interface UsageLimits {
  session5hBudget: number;
  weeklyBudget: number;
  monthlyBudget: number;
}

const DEFAULT_LIMITS: UsageLimits = {
  session5hBudget: 20, // $20 per 5h window
  weeklyBudget: 100,
  monthlyBudget: 200,
};

export function AccountUsagePanel({ accountId }: { accountId: string }) {
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const tzOffsetMinutes = -new Date().getTimezoneOffset(); // JS: +7 → -420; server: east = +
    accountsApi
      .usage(accountId, 365, tzOffsetMinutes)
      .then((res) => {
        if (!cancelled) setUsage(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <CircleNotch size={16} className="animate-spin" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  if (error || !usage) {
    return (
      <p className="py-4 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
        {error ?? "No usage data"}
      </p>
    );
  }

  const { heatmap, windows, totals, byModel, streaks } = usage;
  const limits = DEFAULT_LIMITS;
  const hasActivity = totals.sessions > 0;

  return (
    <div className="flex flex-col gap-5 pt-4">
      {!hasActivity && (
        <div
          className="rounded-lg px-3 py-3 text-xs"
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            color: "var(--color-text-muted)",
          }}
        >
          No sessions recorded yet for this account. Usage will appear here once you run a session.
        </div>
      )}
      {/* Plan usage (Anthropic-style) */}
      <div className="flex flex-col gap-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          Plan Usage Limits
        </h4>
        <ProgressBar
          label="Current session"
          sublabel={resetLabel(windows.session5h.resetAt)}
          value={windows.session5h.cost}
          max={limits.session5hBudget}
          format="cost"
        />
        <ProgressBar
          label="Weekly"
          sublabel={resetLabel(windows.weekly.resetAt)}
          value={windows.weekly.cost}
          max={limits.weeklyBudget}
          format="cost"
        />
        <ProgressBar
          label="Monthly"
          sublabel={resetLabel(windows.monthly.resetAt)}
          value={windows.monthly.cost}
          max={limits.monthlyBudget}
          format="cost"
        />
      </div>

      {/* Heatmap */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h4
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Activity (last 365 days)
          </h4>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {totals.sessions} sessions · {formatTokens(totals.tokens)} tokens · {formatCost(totals.cost)}
          </span>
        </div>
        <Heatmap buckets={heatmap} />
        <div className="flex gap-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
          <span>
            Current streak: <strong style={{ color: "var(--color-text-primary)" }}>{streaks.current}d</strong>
          </span>
          <span>
            Longest: <strong style={{ color: "var(--color-text-primary)" }}>{streaks.longest}d</strong>
          </span>
        </div>
      </div>

      {/* Model breakdown */}
      {byModel.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Model breakdown
          </h4>
          <div className="flex flex-col gap-2">
            {byModel.map((m) => (
              <div key={m.model} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs font-medium">{m.model}</span>
                <div
                  className="relative h-1.5 flex-1 overflow-hidden rounded-full"
                  style={{ background: "var(--glass-bg-heavy)" }}
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width: `${m.pct}%`,
                      background: "var(--color-accent)",
                    }}
                  />
                </div>
                <span
                  className="w-14 shrink-0 text-right text-xs"
                  style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {m.pct.toFixed(0)}%
                </span>
                <span
                  className="w-16 shrink-0 text-right text-xs"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {formatCost(m.cost)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
