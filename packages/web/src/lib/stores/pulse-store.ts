import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────────

export type OperationalState =
  | "flow"
  | "focused"
  | "cautious"
  | "struggling"
  | "spiraling"
  | "blocked";

export type PulseTrend = "improving" | "stable" | "degrading";

export interface PulseReading {
  score: number;
  state: OperationalState;
  trend: PulseTrend;
  signals: Record<string, number>;
  topSignal: string;
  turn: number;
  timestamp: number;
}

// ─── Store ──────────────────────────────────────────────────────────────

const MAX_HISTORY = 20;

interface PulseStore {
  /** sessionId → latest reading */
  readings: Map<string, PulseReading>;
  /** sessionId → history for sparkline */
  history: Map<string, PulseReading[]>;

  pushReading: (sessionId: string, reading: PulseReading) => void;
  clear: (sessionId: string) => void;
}

export const usePulseStore = create<PulseStore>((set) => ({
  readings: new Map(),
  history: new Map(),

  pushReading: (sessionId, reading) =>
    set((state) => {
      const readings = new Map(state.readings);
      readings.set(sessionId, reading);

      const history = new Map(state.history);
      const prev = history.get(sessionId) ?? [];
      const updated = [...prev, reading];
      if (updated.length > MAX_HISTORY) updated.shift();
      history.set(sessionId, updated);

      return { readings, history };
    }),

  clear: (sessionId) =>
    set((state) => {
      const readings = new Map(state.readings);
      readings.delete(sessionId);
      const history = new Map(state.history);
      history.delete(sessionId);
      return { readings, history };
    }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────

export function getPulseColor(score: number): string {
  if (score <= 20) return "#10B981";
  if (score <= 40) return "#6366F1";
  if (score <= 60) return "#F59E0B";
  if (score <= 80) return "#EF4444";
  return "#DC2626";
}

export function getTrendArrow(trend: PulseTrend): string {
  if (trend === "improving") return "▲";
  if (trend === "degrading") return "▼";
  return "▬";
}

export function getStateLabel(state: OperationalState): string {
  const labels: Record<OperationalState, string> = {
    flow: "Flow",
    focused: "Focused",
    cautious: "Cautious",
    struggling: "Struggling",
    spiraling: "Spiraling",
    blocked: "Blocked",
  };
  return labels[state];
}

const SIGNAL_LABELS: Record<string, string> = {
  failureRate: "Failure Rate",
  editChurn: "Edit Churn",
  costAccel: "Cost Acceleration",
  contextPressure: "Context Pressure",
  thinkingDepth: "Thinking Depth",
  toolDiversity: "Tool Diversity",
  completionTone: "Completion Tone",
};

export function getSignalLabel(key: string): string {
  return SIGNAL_LABELS[key] ?? key;
}
