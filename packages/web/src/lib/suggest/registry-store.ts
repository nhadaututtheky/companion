import { create } from "zustand";
import { api } from "@/lib/api-client.js";

export interface RegistrySkill {
  name: string;
  description: string;
  suggestTriggers: string[] | null;
  source: "user" | "project";
}

interface RegistryState {
  skills: RegistrySkill[];
  loading: boolean;
  lastFetchedAt: number;

  /** Fetch skills, skipping if fetched within the last 60s */
  fetchSkills: () => Promise<void>;
  /** Force re-fetch regardless of cache age */
  refresh: () => Promise<void>;
}

const CACHE_TTL_MS = 60_000;

async function doFetch(set: (state: Partial<RegistryState>) => void): Promise<void> {
  set({ loading: true });
  try {
    const res = await api.get<{ success: boolean; skills: RegistrySkill[] }>(
      "/api/registry/skills",
    );
    set({
      skills: res.skills ?? [],
      lastFetchedAt: Date.now(),
    });
  } catch {
    // Non-fatal — suggestions simply won't show skill data
  } finally {
    set({ loading: false });
  }
}

export const useRegistryStore = create<RegistryState>((set, get) => ({
  skills: [],
  loading: false,
  lastFetchedAt: 0,

  fetchSkills: async () => {
    const { loading, lastFetchedAt } = get();
    if (loading) return;
    if (lastFetchedAt > 0 && Date.now() - lastFetchedAt < CACHE_TTL_MS) return;
    await doFetch(set);
  },

  refresh: async () => {
    await doFetch(set);
  },
}));

// Individual selectors (avoid object destructure to prevent infinite loops)
export const selectSkills = (s: RegistryState) => s.skills;
export const selectRegistryLoading = (s: RegistryState) => s.loading;
export const selectLastFetchedAt = (s: RegistryState) => s.lastFetchedAt;
export const selectFetchSkills = (s: RegistryState) => s.fetchSkills;
export const selectRefreshRegistry = (s: RegistryState) => s.refresh;
