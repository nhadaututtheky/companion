"use client";

import { ArrowsClockwise, CircleNotch } from "@phosphor-icons/react";
import { maxQuotaUtil, type AccountQuota, type AccountQuotaWindow } from "@companion/shared";

/**
 * AccountQuotaBars — inline Anthropic-reported quota display for one
 * account row. Strictly presentational: all data + thresholds come in
 * via props, refresh is delegated to the parent.
 *
 * Layout:
 *   - Pro/Max tier  → 2 bars: "5h" + "weekly"
 *   - Team/Enterprise → 3 bars: "5h" + "weekly opus" + "weekly sonnet"
 *
 * Colors are applied per-bar based on its own util relative to the user's
 * `warnThreshold` / `switchThreshold` pair. A small tick mark on each bar
 * shows where `warnThreshold` sits so the user can read the bar at a glance.
 */

export interface AccountQuotaBarsProps {
  quota: AccountQuota | null;
  tier: string | null;
  warnThreshold: number;
  switchThreshold: number;
  onRefresh: () => void;
  refreshing: boolean;
}

interface BarSpec {
  key: string;
  label: string;
  window: AccountQuotaWindow | null;
}

const TEAM_TIERS = new Set(["default_claude_team", "default_claude_enterprise"]);

export function AccountQuotaBars(props: AccountQuotaBarsProps) {
  const { quota, tier, warnThreshold, switchThreshold, onRefresh, refreshing } = props;

  // Skeleton while the parent is still fetching the initial list.
  if (quota === undefined) {
    return <QuotaSkeleton />;
  }

  const isTeamTier = tier != null && TEAM_TIERS.has(tier);
  const bars: BarSpec[] = isTeamTier
    ? [
        { key: "five_hour", label: "5h", window: quota?.fiveHour ?? null },
        { key: "seven_day_opus", label: "7d Opus", window: quota?.sevenDayOpus ?? null },
        { key: "seven_day_sonnet", label: "7d Sonnet", window: quota?.sevenDaySonnet ?? null },
      ]
    : [
        { key: "five_hour", label: "5h", window: quota?.fiveHour ?? null },
        { key: "seven_day", label: "weekly", window: quota?.sevenDay ?? null },
      ];

  const maxUtil = maxQuotaUtil(quota);
  const nearLimit = maxUtil != null && maxUtil >= warnThreshold;
  const agedLabel = quota ? formatAge(Date.now() - quota.fetchedAt) : null;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Anthropic quota</span>
          {nearLimit && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "#f59e0b20", color: "#f59e0b" }}
              title={`At least one window is ≥ ${Math.round(warnThreshold * 100)}%`}
            >
              near limit
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {agedLabel && <span className="text-text-muted text-[11px]">updated {agedLabel}</span>}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-text-secondary cursor-pointer rounded-md p-1 transition-colors hover:text-text-primary disabled:opacity-50"
            aria-label="Refresh Anthropic quota"
            title="Refresh quota from Anthropic"
          >
            {refreshing ? (
              <CircleNotch size={12} weight="bold" className="animate-spin" />
            ) : (
              <ArrowsClockwise size={12} weight="bold" />
            )}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {bars.map((bar) => (
          <QuotaBar
            key={bar.key}
            label={bar.label}
            window={bar.window}
            warnThreshold={warnThreshold}
            switchThreshold={switchThreshold}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Bar ────────────────────────────────────────────────────────────────────

interface QuotaBarProps {
  label: string;
  window: AccountQuotaWindow | null;
  warnThreshold: number;
  switchThreshold: number;
}

function QuotaBar(props: QuotaBarProps) {
  const { label, window, warnThreshold, switchThreshold } = props;
  const util = window?.util;
  const hasData = typeof util === "number";
  const pct = hasData ? Math.min(100, Math.max(0, util * 100)) : 0;
  const color = hasData ? barColor(util, warnThreshold, switchThreshold) : "#64748b";
  const resetLabel = window ? formatReset(window.resetsAt) : null;

  const warnPct = Math.round(warnThreshold * 100);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-muted w-14 shrink-0 text-right">{label}</span>
      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: "var(--color-bg-base)" }}
        role="progressbar"
        aria-valuenow={hasData ? Math.round(util * 100) : 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} utilization`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: color,
          }}
        />
        {/* Warn-threshold marker tick — tiny vertical line behind the fill. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-[1px]"
          style={{
            left: `calc(${warnPct}% - 0.5px)`,
            background: "color-mix(in srgb, var(--color-text-muted) 40%, transparent)",
          }}
          title={`Warn at ${warnPct}%`}
        />
      </div>
      <span
        className="w-20 shrink-0 text-right tabular-nums"
        style={{ fontFamily: "var(--font-mono)", color }}
      >
        {hasData ? `${Math.round(util * 100)}%` : "—"}
      </span>
      {resetLabel && (
        <span className="text-text-muted w-24 shrink-0 text-right text-[11px]" title={resetLabel}>
          {resetLabel}
        </span>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function barColor(util: number, warn: number, sw: number): string {
  if (util >= sw) return "#ef4444"; // red — rotation will skip
  if (util >= warn) return "#f59e0b"; // yellow — approaching switch threshold
  return "#10b981"; // green — safe
}

function formatAge(ms: number): string {
  if (ms < 45_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatReset(resetsAt: number): string {
  const ms = resetsAt - Date.now();
  if (ms <= 0) return "resets now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `resets in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `resets in ${hours}h`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h > 0 ? `resets in ${days}d ${h}h` : `resets in ${days}d`;
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function QuotaSkeleton() {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="h-3 w-32 animate-pulse rounded bg-bg-base" />
      <div className="h-1.5 w-full animate-pulse rounded-full bg-bg-base" />
      <div className="h-1.5 w-full animate-pulse rounded-full bg-bg-base" />
    </div>
  );
}
