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

export const accounts = {
  list: () => request<{ data: AccountInfo[] }>("/api/accounts"),

  active: () => request<{ data: AccountInfo | null }>("/api/accounts/active"),

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
