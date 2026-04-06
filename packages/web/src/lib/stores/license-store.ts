/**
 * License state store — fetches tier/features from server, exposes helpers.
 * Components use `useLicenseStore` to check feature access and show upgrade prompts.
 */

import { create } from "zustand";
import { api } from "@/lib/api-client";

interface LicenseState {
  tier: "free" | "trial" | "pro";
  valid: boolean;
  features: string[];
  maxSessions: number;
  expiresAt: string;
  daysLeft?: number;
  loaded: boolean;
  showUpgrade: boolean;
  upgradeReason: string;

  // Actions
  fetch: () => Promise<void>;
  hasFeature: (feature: string) => boolean;
  isPro: () => boolean;
  promptUpgrade: (reason: string) => void;
  dismissUpgrade: () => void;
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
  tier: "free",
  valid: false,
  features: [],
  maxSessions: 2,
  expiresAt: "",
  daysLeft: undefined,
  loaded: false,
  showUpgrade: false,
  upgradeReason: "",

  fetch: async () => {
    try {
      const res = await api.get<{
        data: {
          tier: string;
          valid: boolean;
          features: string[];
          maxSessions: number;
          expiresAt: string;
          daysLeft?: number;
        };
      }>("/api/license");
      if (res.data) {
        set({
          tier: res.data.tier as "free" | "trial" | "pro",
          valid: res.data.valid,
          features: res.data.features,
          maxSessions: res.data.maxSessions,
          expiresAt: res.data.expiresAt,
          daysLeft: res.data.daysLeft,
          loaded: true,
        });
      }
    } catch {
      set({ loaded: true });
    }
  },

  hasFeature: (feature: string) => get().features.includes(feature),

  isPro: () => get().tier === "pro",

  promptUpgrade: (reason: string) => set({ showUpgrade: true, upgradeReason: reason }),

  dismissUpgrade: () => set({ showUpgrade: false, upgradeReason: "" }),
}));
