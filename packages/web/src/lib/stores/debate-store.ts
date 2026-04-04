import { create } from "zustand";
import type { ModelInfo } from "@/components/session/model-bar";

interface DebateStore {
  /** Debate participants per session: sessionId → ModelInfo[] */
  participants: Record<string, ModelInfo[]>;
  addParticipant: (sessionId: string, model: ModelInfo) => void;
  removeParticipant: (sessionId: string, modelId: string) => void;
  getParticipants: (sessionId: string) => ModelInfo[];
  clearSession: (sessionId: string) => void;
}

export const useDebateStore = create<DebateStore>((set, get) => ({
  participants: {},

  addParticipant: (sessionId, model) =>
    set((s) => {
      const current = s.participants[sessionId] ?? [];
      if (current.some((p) => p.id === model.id)) return s;
      return {
        participants: {
          ...s.participants,
          [sessionId]: [...current, model],
        },
      };
    }),

  removeParticipant: (sessionId, modelId) =>
    set((s) => {
      const current = s.participants[sessionId] ?? [];
      return {
        participants: {
          ...s.participants,
          [sessionId]: current.filter((p) => p.id !== modelId),
        },
      };
    }),

  getParticipants: (sessionId) => get().participants[sessionId] ?? [],

  clearSession: (sessionId) =>
    set((s) => {
      const { [sessionId]: _, ...rest } = s.participants;
      return { participants: rest };
    }),
}));
