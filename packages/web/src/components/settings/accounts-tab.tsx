"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  ChartBar,
  CheckCircle,
  CircleNotch,
  PencilSimple,
  SkipForward,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import {
  ACCOUNT_THRESHOLD_MAX,
  ACCOUNT_THRESHOLD_MIN,
  ACCOUNT_THRESHOLD_STEP,
  DEFAULT_ACCOUNT_SWITCH_THRESHOLD,
  DEFAULT_ACCOUNT_WARN_THRESHOLD,
  QUOTA_STALE_AFTER_MS,
} from "@companion/shared";
import { SettingSection } from "./settings-tabs";
import { AccountUsagePanel } from "./account-usage-panel";
import { AccountQuotaBars } from "./account-quota-bars";
import { MergeEventsBanner } from "./merge-events-banner";
import {
  accounts as accountsApi,
  type AccountInfo,
  type AccountSettings,
} from "@/lib/api/accounts";

const STATUS_COLORS: Record<string, { bg: string; dot: string; label: string }> = {
  ready: { bg: "#10b98115", dot: "#10b981", label: "Ready" },
  rate_limited: { bg: "#f59e0b15", dot: "#f59e0b", label: "Rate Limited" },
  expired: { bg: "#ef444415", dot: "#ef4444", label: "Expired" },
  error: { bg: "#ef444415", dot: "#ef4444", label: "Error" },
};

function formatCost(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(usd);
}

function formatCooldown(until: string | null): string | null {
  if (!until) return null;
  const remainMs = new Date(until).getTime() - Date.now();
  if (remainMs <= 0) return null;
  const mins = Math.ceil(remainMs / 60_000);
  return `${mins}m left`;
}

export function AccountsTab() {
  const [list, setList] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AccountSettings>({
    autoSwitchEnabled: true,
    warnThreshold: DEFAULT_ACCOUNT_WARN_THRESHOLD,
    switchThreshold: DEFAULT_ACCOUNT_SWITCH_THRESHOLD,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [togglingSkipId, setTogglingSkipId] = useState<string | null>(null);
  const [switchingNext, setSwitchingNext] = useState(false);
  const [refreshingQuotaId, setRefreshingQuotaId] = useState<string | null>(null);
  const bgFetchTriggeredRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await accountsApi.list();
      setList(res.data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    accountsApi
      .getSettings()
      .then((res) => {
        setSettings(res.data);
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, [refresh]);

  // When the Settings tab becomes visible AND at least one account's quota
  // is stale (>5 min old or never fetched), kick off staggered background
  // refreshes. One account at a time, 500 ms apart, to stay polite to the
  // Anthropic endpoint and avoid UI thrash.
  useEffect(() => {
    if (list.length === 0) return;
    if (document.visibilityState !== "visible") return;
    if (bgFetchTriggeredRef.current) return;

    const stale = list.filter((a) => {
      if (a.status !== "ready") return false;
      if (a.skipInRotation) return false;
      const fetchedAt = a.quota?.fetchedAt ?? 0;
      return Date.now() - fetchedAt > QUOTA_STALE_AFTER_MS;
    });
    if (stale.length === 0) return;

    bgFetchTriggeredRef.current = true;
    let cancelled = false;

    (async () => {
      for (let i = 0; i < stale.length; i++) {
        if (cancelled) return;
        const acct = stale[i]!;
        try {
          const res = await accountsApi.refreshQuota(acct.id);
          if (cancelled) return;
          setList((prev) => prev.map((a) => (a.id === acct.id ? { ...a, quota: res.data } : a)));
        } catch {
          // Silent — auto-fetch shouldn't pester the user. The manual refresh
          // button surfaces the error instead.
        }
        // Stagger next call by 500 ms so visibility flickers don't stack.
        await new Promise((r) => setTimeout(r, 500));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const handleToggleAutoSwitch = async () => {
    const next = { ...settings, autoSwitchEnabled: !settings.autoSwitchEnabled };
    const prev = settings;
    setSettings(next); // optimistic
    try {
      const res = await accountsApi.setSettings({ autoSwitchEnabled: next.autoSwitchEnabled });
      setSettings(res.data); // server is source of truth
      toast.success(
        next.autoSwitchEnabled ? "Auto round-robin enabled" : "Auto round-robin disabled",
      );
    } catch (err) {
      setSettings(prev);
      toast.error(`Failed to update setting: ${String(err)}`);
    }
  };

  // Commit threshold change through the server so it can normalize (clamp,
  // snap, enforce min gap) and echo back the final pair. Local state is
  // optimistic while the roundtrip is in flight.
  const commitThreshold = async (which: "warn" | "switch", value: number) => {
    const prev = settings;
    const optimistic: AccountSettings = {
      ...settings,
      ...(which === "warn" ? { warnThreshold: value } : { switchThreshold: value }),
    };
    setSettings(optimistic);
    try {
      const res = await accountsApi.setSettings({
        ...(which === "warn"
          ? { warnThreshold: value }
          : { switchThreshold: value }),
        lastChanged: which,
      });
      setSettings(res.data);
    } catch (err) {
      setSettings(prev);
      toast.error(`Failed to update threshold: ${String(err)}`);
    }
  };

  const handleRefreshQuota = async (id: string) => {
    if (refreshingQuotaId) return;
    setRefreshingQuotaId(id);
    try {
      const res = await accountsApi.refreshQuota(id);
      // Patch the row locally so the bars reflect the fresh quota without a
      // full refresh() round-trip (keeps scroll + expanded state).
      setList((prev) => prev.map((a) => (a.id === id ? { ...a, quota: res.data } : a)));
    } catch (err) {
      toast.error(`Quota refresh failed: ${String(err)}`);
    } finally {
      setRefreshingQuotaId(null);
    }
  };

  const handleToggleSkip = async (id: string, current: boolean) => {
    setTogglingSkipId(id);
    // optimistic update
    setList((prev) => prev.map((a) => (a.id === id ? { ...a, skipInRotation: !current } : a)));
    try {
      await accountsApi.setSkipRotation(id, !current);
    } catch (err) {
      setList((prev) => prev.map((a) => (a.id === id ? { ...a, skipInRotation: current } : a)));
      toast.error(`Failed to update rotation flag: ${String(err)}`);
    } finally {
      setTogglingSkipId(null);
    }
  };

  const handleSwitchNext = async () => {
    if (switchingNext) return;
    setSwitchingNext(true);
    try {
      const res = await accountsApi.switchNext();
      toast.success(`Switched to ${res.data.label}`);
      await refresh();
    } catch (err) {
      toast.error(`Switch failed: ${String(err)}`);
    } finally {
      setSwitchingNext(false);
    }
  };

  const handleActivate = async (id: string) => {
    setSwitching(id);
    try {
      await accountsApi.activate(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSwitching(null);
    }
  };

  const handleRename = async (id: string) => {
    if (!editLabel.trim()) return;
    try {
      await accountsApi.rename(id, editLabel.trim());
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete account "${label}"? This cannot be undone.`)) return;
    try {
      await accountsApi.remove(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCapture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      await accountsApi.capture();
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setCapturing(false);
    }
  };

  if (loading && list.length === 0) {
    return (
      <SettingSection title="Accounts">
        <p className="text-text-secondary text-sm">Loading...</p>
      </SettingSection>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingSection
        title="Multi-Account Manager"
        description="Manage multiple Anthropic OAuth accounts. Accounts are auto-captured when you run /login in Claude Code."
      >
        {error && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ background: "#ef444415", color: "#ef4444" }}
          >
            <Warning size={14} weight="bold" />
            {error}
          </div>
        )}

        <MergeEventsBanner accounts={list} onResolved={refresh} />

        {/* Rotation controls: only meaningful once at least 2 accounts exist */}
        {list.length >= 2 && (
          <div
            className="mb-3 flex flex-col gap-3 rounded-lg px-3 py-2"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--glass-border)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.autoSwitchEnabled}
                  disabled={!settingsLoaded}
                  onChange={() => void handleToggleAutoSwitch()}
                  className="h-4 w-4 cursor-pointer"
                  aria-label="Auto round-robin on rate limit"
                />
                <span className="text-text-primary font-medium">Auto round-robin</span>
                <span className="text-text-muted text-xs">
                  Switch accounts automatically when one hits its rate limit
                </span>
              </label>
              <button
                onClick={() => void handleSwitchNext()}
                disabled={switchingNext}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  color: "var(--color-accent)",
                  background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                }}
                title="Switch to the next ready account now"
                aria-label="Switch to next available account"
              >
                {switchingNext ? (
                  <CircleNotch size={12} weight="bold" className="animate-spin" />
                ) : (
                  <ArrowsLeftRight size={12} weight="bold" />
                )}
                {switchingNext ? "Switching..." : "Switch to next"}
              </button>
            </div>

            <ThresholdSliders
              settings={settings}
              disabled={!settingsLoaded || !settings.autoSwitchEnabled}
              onChange={(which, value) => void commitThreshold(which, value)}
            />
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-text-secondary flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm">No accounts saved yet.</p>
            <p className="text-xs">
              Run <code className="bg-bg-elevated rounded px-1.5 py-0.5">/login</code> in Claude
              Code — Companion will auto-capture the credentials.
            </p>
            <button
              onClick={handleCapture}
              disabled={capturing}
              className="text-accent flex cursor-pointer items-center gap-1.5 text-xs font-medium disabled:opacity-50"
            >
              <ArrowsClockwise
                size={12}
                weight="bold"
                className={capturing ? "animate-spin" : ""}
              />
              {capturing ? "Scanning..." : "Manual capture"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((account) => {
              const statusInfo = STATUS_COLORS[account.status] ?? STATUS_COLORS.ready;
              const cooldown = formatCooldown(account.statusUntil);
              const isEditing = editingId === account.id;
              const isExpanded = expandedId === account.id;

              return (
                <div
                  key={account.id}
                  className="flex flex-col rounded-lg transition-colors"
                  style={{
                    background: account.isActive
                      ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                      : "var(--color-bg-elevated)",
                    border: account.isActive
                      ? "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)"
                      : "1px solid var(--glass-border)",
                  }}
                >
                  <div className="flex items-center gap-3 px-3 py-3">
                    {/* Status dot */}
                    <div
                      className="shrink-0 rounded-full"
                      role="img"
                      aria-label={statusInfo.label}
                      style={{
                        width: 8,
                        height: 8,
                        background: statusInfo.dot,
                        boxShadow: `0 0 6px ${statusInfo.dot}40`,
                      }}
                      title={statusInfo.label}
                    />

                    {/* Label + info */}
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename(account.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="bg-bg-base rounded px-2 py-1 text-sm"
                            autoFocus
                          />
                          <button
                            onClick={() => void handleRename(account.id)}
                            className="text-accent cursor-pointer text-xs font-medium"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary text-sm font-medium">
                            {account.label}
                          </span>
                          {account.isActive && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                              style={{
                                background:
                                  "color-mix(in srgb, var(--color-accent) 15%, transparent)",
                                color: "var(--color-accent)",
                              }}
                            >
                              Active
                            </span>
                          )}
                          {account.subscriptionType && (
                            <span className="text-text-muted text-xs capitalize">
                              {account.subscriptionType}
                            </span>
                          )}
                          {account.skipInRotation && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-xs font-medium"
                              style={{
                                background: "#f59e0b15",
                                color: "#f59e0b",
                              }}
                              title="Excluded from auto round-robin"
                            >
                              Skipped
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-text-muted mt-0.5 flex items-center gap-2 text-xs">
                        <span style={{ fontFamily: "var(--font-mono)" }}>
                          {formatCost(account.totalCostUsd)}
                        </span>
                        {cooldown && (
                          <span style={{ color: statusInfo.dot }}>
                            {statusInfo.label} ({cooldown})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : account.id)}
                        className="text-text-secondary cursor-pointer rounded-md p-1.5 transition-colors"
                        style={{
                          color: isExpanded ? "var(--color-accent)" : undefined,
                        }}
                        title={isExpanded ? "Hide usage" : "Show usage"}
                        aria-label={`${isExpanded ? "Hide" : "Show"} usage for ${account.label}`}
                        aria-expanded={isExpanded}
                      >
                        <ChartBar size={14} weight="bold" />
                      </button>
                      <button
                        onClick={() => void handleToggleSkip(account.id, account.skipInRotation)}
                        disabled={togglingSkipId === account.id}
                        className="cursor-pointer rounded-md p-1.5 transition-colors disabled:opacity-50"
                        style={{
                          color: account.skipInRotation ? "#f59e0b" : "var(--color-text-secondary)",
                        }}
                        title={
                          account.skipInRotation
                            ? "Include in auto rotation"
                            : "Skip in auto rotation"
                        }
                        aria-label={`${account.skipInRotation ? "Include" : "Skip"} ${account.label} in rotation`}
                        aria-pressed={account.skipInRotation}
                      >
                        <SkipForward size={14} weight={account.skipInRotation ? "fill" : "bold"} />
                      </button>
                      {!account.isActive && (
                        <button
                          onClick={() => void handleActivate(account.id)}
                          disabled={switching === account.id}
                          className="cursor-pointer rounded-md p-1.5 transition-colors"
                          style={{
                            color: "var(--color-accent)",
                            background:
                              switching === account.id ? "var(--color-bg-elevated)" : "transparent",
                          }}
                          title="Switch to this account"
                          aria-label={`Switch to ${account.label}`}
                        >
                          <CheckCircle size={16} weight="bold" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingId(account.id);
                          setEditLabel(account.label);
                        }}
                        className="text-text-secondary cursor-pointer rounded-md p-1.5 transition-colors"
                        title="Rename"
                        aria-label={`Rename ${account.label}`}
                      >
                        <PencilSimple size={14} weight="bold" />
                      </button>
                      {!account.isActive && (
                        <button
                          onClick={() => void handleDelete(account.id, account.label)}
                          className="cursor-pointer rounded-md p-1.5 transition-colors"
                          style={{ color: "#ef4444" }}
                          title="Delete"
                          aria-label={`Delete ${account.label}`}
                        >
                          <Trash size={14} weight="bold" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Anthropic quota bars — slim inline display, always visible
                       once we've fetched the list. Separate from the expanded
                       "device cost" panel below. */}
                  <div
                    className="border-t px-3 py-2"
                    style={{ borderColor: "var(--glass-border)" }}
                  >
                    <AccountQuotaBars
                      quota={account.quota}
                      tier={account.rateLimitTier}
                      warnThreshold={settings.warnThreshold}
                      switchThreshold={settings.switchThreshold}
                      onRefresh={() => void handleRefreshQuota(account.id)}
                      refreshing={refreshingQuotaId === account.id}
                    />
                  </div>
                  {isExpanded && (
                    <div
                      className="border-t px-3 py-3"
                      style={{ borderColor: "var(--glass-border)" }}
                    >
                      <AccountUsagePanel accountId={account.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer actions */}
        {list.length > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={handleCapture}
              disabled={capturing}
              className="text-text-secondary flex cursor-pointer items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
            >
              <ArrowsClockwise
                size={12}
                weight="bold"
                className={capturing ? "animate-spin" : ""}
              />
              {capturing ? "Scanning..." : "Re-scan credentials"}
            </button>
            <span className="text-text-muted text-xs">
              {list.length} account{list.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </SettingSection>
    </div>
  );
}

// ─── Threshold sliders ──────────────────────────────────────────────────────

interface ThresholdSlidersProps {
  settings: AccountSettings;
  disabled: boolean;
  onChange: (which: "warn" | "switch", value: number) => void;
}

/**
 * Two paired sliders for the warn/switch thresholds. Ranges are bounded
 * dynamically so the invariant `warn + STEP <= switch` is enforced in the
 * UI — the server still normalizes on commit, this just prevents silly
 * drags. Values echoed back from the server always wins in parent state.
 */
function ThresholdSliders(props: ThresholdSlidersProps) {
  const { settings, disabled, onChange } = props;
  const warnMax = Math.max(
    ACCOUNT_THRESHOLD_MIN,
    Math.round((settings.switchThreshold - ACCOUNT_THRESHOLD_STEP) * 100) / 100,
  );
  const switchMin = Math.min(
    ACCOUNT_THRESHOLD_MAX,
    Math.round((settings.warnThreshold + ACCOUNT_THRESHOLD_STEP) * 100) / 100,
  );

  return (
    <div className="flex flex-col gap-2">
      <SliderRow
        id="accounts-warn-threshold"
        label="Warning at"
        hint="Bar flips yellow when any window hits this"
        value={settings.warnThreshold}
        min={ACCOUNT_THRESHOLD_MIN}
        max={warnMax}
        step={ACCOUNT_THRESHOLD_STEP}
        disabled={disabled}
        onChange={(v) => onChange("warn", v)}
      />
      <SliderRow
        id="accounts-switch-threshold"
        label="Skip rotation at"
        hint="Round-robin excludes the account when any window hits this"
        value={settings.switchThreshold}
        min={switchMin}
        max={ACCOUNT_THRESHOLD_MAX}
        step={ACCOUNT_THRESHOLD_STEP}
        disabled={disabled}
        onChange={(v) => onChange("switch", v)}
      />
    </div>
  );
}

interface SliderRowProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function SliderRow(props: SliderRowProps) {
  const { id, label, hint, value, min, max, step, disabled, onChange } = props;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label htmlFor={id} className="text-text-primary w-32 shrink-0 font-medium">
        {label}
      </label>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        aria-valuetext={`${Math.round(value * 100)}%`}
      />
      <span
        className="w-10 shrink-0 text-right tabular-nums"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {Math.round(value * 100)}%
      </span>
      <span className="text-text-muted w-full text-[11px] sm:w-auto">{hint}</span>
    </div>
  );
}
