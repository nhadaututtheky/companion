import { request } from "./base";
import type { AccountQuota } from "@companion/shared";

export type { AccountQuota } from "@companion/shared";

export interface AccountBudgets {
  session5hBudget: number | null;
  weeklyBudget: number | null;
  monthlyBudget: number | null;
}

export interface AccountInfo {
  id: string;
  label: string;
  fingerprint: string;
  identity: string | null;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  isActive: boolean;
  status: string;
  statusUntil: string | null;
  totalCostUsd: number;
  session5hBudget: number | null;
  weeklyBudget: number | null;
  monthlyBudget: number | null;
  skipInRotation: boolean;
  lastUsedAt: string | null;
  /** Anthropic-reported quota windows — null until first refresh. */
  quota: AccountQuota | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSettings {
  autoSwitchEnabled: boolean;
  /** Quota % (0..1) that flips the bar yellow in the UI. */
  warnThreshold: number;
  /** Quota % (0..1) that makes round-robin skip this account. */
  switchThreshold: number;
}

export interface HeatmapBucket {
  date: string;
  cost: number;
  sessions: number;
  tokens: number;
}

export interface WindowUsage {
  cost: number;
  sessions: number;
  tokens: number;
  resetAt: string | null;
}

export interface ModelBreakdown {
  model: string;
  cost: number;
  sessions: number;
  tokens: number;
  pct: number;
}

export interface AccountUsage {
  heatmap: HeatmapBucket[];
  windows: {
    session5h: WindowUsage;
    weekly: WindowUsage;
    monthly: WindowUsage;
  };
  totals: { cost: number; sessions: number; tokens: number };
  byModel: ModelBreakdown[];
  streaks: { current: number; longest: number };
  budgets: AccountBudgets;
}

/** Snapshot of one row in a merge group, recorded BEFORE the auto-merge ran. */
export interface MergeBeforeRow {
  id: string;
  label: string;
  session5hBudget: number | null;
  weeklyBudget: number | null;
  monthlyBudget: number | null;
  totalCostUsd: number;
}

/** A pending budget-conflict surfaced by the dedup pipeline. */
export interface PendingMergeEvent {
  id: string;
  survivorAccountId: string;
  oauthSubject: string;
  beforeState: MergeBeforeRow[];
  appliedSession5hBudget: number | null;
  appliedWeeklyBudget: number | null;
  appliedMonthlyBudget: number | null;
  mergedAt: string;
}

/** "kept" = accept auto-pick; "applied:<accountId>" = re-apply that row's caps. */
export type MergeEventChoice = "kept" | `applied:${string}`;

export const accounts = {
  list: () => request<{ data: AccountInfo[] }>("/api/accounts"),

  active: () => request<{ data: AccountInfo | null }>("/api/accounts/active"),

  usage: (id: string, days = 365, tzOffsetMinutes = 0) =>
    request<{ data: AccountUsage }>(`/api/accounts/${id}/usage?days=${days}&tz=${tzOffsetMinutes}`),

  activate: (id: string) =>
    request<{ data: { id: string } }>(`/api/accounts/${id}/activate`, {
      method: "PUT",
    }),

  rename: (id: string, label: string) =>
    request<{ data: { id: string; label: string } }>(`/api/accounts/${id}/rename`, {
      method: "PUT",
      body: JSON.stringify({ label }),
    }),

  setBudgets: (id: string, budgets: AccountBudgets) =>
    request<{ data: AccountBudgets & { id: string } }>(`/api/accounts/${id}/budgets`, {
      method: "PUT",
      body: JSON.stringify(budgets),
    }),

  setSkipRotation: (id: string, skip: boolean) =>
    request<{ data: { id: string; skipInRotation: boolean } }>(
      `/api/accounts/${id}/skip-rotation`,
      {
        method: "PUT",
        body: JSON.stringify({ skip }),
      },
    ),

  switchNext: () =>
    request<{ data: { id: string; label: string } }>(`/api/accounts/switch-next`, {
      method: "POST",
    }),

  getSettings: () => request<{ data: AccountSettings }>(`/api/accounts/settings`),

  /**
   * Partial update for account settings. Server normalizes thresholds + returns
   * the final pair, so callers should re-apply `res.data` to local state.
   * `lastChanged` tells the server which slider to prefer when enforcing the
   * min-gap invariant.
   */
  setSettings: (
    patch: Partial<AccountSettings> & { lastChanged?: "warn" | "switch" },
  ) =>
    request<{ data: AccountSettings }>(`/api/accounts/settings`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  refreshQuota: (id: string) =>
    request<{ data: AccountQuota }>(`/api/accounts/${id}/quota/refresh`, {
      method: "POST",
    }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/api/accounts/${id}`, {
      method: "DELETE",
    }),

  capture: () =>
    request<{ data: { captured: boolean } }>("/api/accounts/capture", {
      method: "POST",
    }),

  // ── Phase 3: subject-merge conflict events ────────────────────────────────
  listMergeEvents: () =>
    request<{ data: PendingMergeEvent[] }>("/api/accounts/merge-events"),

  applyMergeChoice: (eventId: string, choice: MergeEventChoice) =>
    request<{ data: { id: string } }>(`/api/accounts/merge-events/${eventId}/apply`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    }),

  dismissMergeEvent: (eventId: string) =>
    request<{ data: { id: string } }>(`/api/accounts/merge-events/${eventId}/dismiss`, {
      method: "POST",
    }),
};
