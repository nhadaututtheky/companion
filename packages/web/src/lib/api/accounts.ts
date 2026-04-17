import { request } from "./base";

export interface AccountInfo {
  id: string;
  label: string;
  fingerprint: string;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  isActive: boolean;
  status: string;
  statusUntil: string | null;
  totalCostUsd: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export const accounts = {
  list: () => request<{ data: AccountInfo[] }>("/api/accounts"),

  active: () => request<{ data: AccountInfo | null }>("/api/accounts/active"),

  usage: (id: string, days = 365, tzOffsetMinutes = 0) =>
    request<{ data: AccountUsage }>(
      `/api/accounts/${id}/usage?days=${days}&tz=${tzOffsetMinutes}`,
    ),

  activate: (id: string) =>
    request<{ data: { id: string } }>(`/api/accounts/${id}/activate`, {
      method: "PUT",
    }),

  rename: (id: string, label: string) =>
    request<{ data: { id: string; label: string } }>(`/api/accounts/${id}/rename`, {
      method: "PUT",
      body: JSON.stringify({ label }),
    }),

  remove: (id: string) =>
    request<{ success: boolean }>(`/api/accounts/${id}`, {
      method: "DELETE",
    }),

  capture: () =>
    request<{ data: { captured: boolean } }>("/api/accounts/capture", {
      method: "POST",
    }),
};
