import { create } from "zustand";

export interface SharedMessage {
  id: string;
  /** Which session responded, or "user" for broadcast messages */
  sessionId: string;
  sessionName: string;
  sessionColor: string;
  content: string;
  timestamp: number;
  role: "user" | "assistant";
}

export type RingMode = "broadcast" | "debate";

/** Model preset for debate agent selection */
export interface ModelPreset {
  id: string;
  label: string;
  provider: "anthropic" | "openai-compatible";
  /** If true, uses OpenRouter as proxy (baseUrl from settings) */
  viaOpenRouter?: boolean;
}

/** Per-agent model assignment in debate config */
export interface DebateAgentModel {
  agentId: string;
  model: string;
  label: string;
}

/** Popular model presets — OpenRouter model IDs */
/** Popular model presets — OpenRouter model IDs (updated 2026-03) */
export const MODEL_PRESETS: ModelPreset[] = [
  { id: "default", label: "Default (Settings)", provider: "openai-compatible" },
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "openai-compatible", viaOpenRouter: true },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "openai-compatible", viaOpenRouter: true },
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "openai-compatible", viaOpenRouter: true },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "openai-compatible", viaOpenRouter: true },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "openai-compatible", viaOpenRouter: true },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "openai-compatible", viaOpenRouter: true },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "openai-compatible", viaOpenRouter: true },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", provider: "openai-compatible", viaOpenRouter: true },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "openai-compatible", viaOpenRouter: true },
  { id: "x-ai/grok-3", label: "Grok 3", provider: "openai-compatible", viaOpenRouter: true },
];

interface RingStore {
  linkedSessionIds: string[];
  topic: string;
  isExpanded: boolean;
  isSelecting: boolean;
  position: { x: number; y: number };
  sharedMessages: SharedMessage[];
  /** Current mode: broadcast (default) or debate */
  mode: RingMode;
  /** Active debate channel ID (if in debate mode) */
  debateChannelId: string | null;
  /** Per-agent model assignments for multi-model debate */
  debateAgentModels: DebateAgentModel[];

  linkSession: (id: string) => void;
  unlinkSession: (id: string) => void;
  setTopic: (t: string) => void;
  setExpanded: (v: boolean) => void;
  setSelecting: (v: boolean) => void;
  setPosition: (pos: { x: number; y: number }) => void;
  addSharedMessage: (msg: SharedMessage) => void;
  setMode: (mode: RingMode) => void;
  setDebateChannelId: (id: string | null) => void;
  setDebateAgentModel: (agentId: string, model: string, label: string) => void;
  clearDebateAgentModels: () => void;
  reset: () => void;
}

const DEFAULT_POSITION = { x: -1, y: -1 }; // -1 means "not yet initialized — use default"

export const useRingStore = create<RingStore>((set) => ({
  linkedSessionIds: [],
  topic: "",
  isExpanded: false,
  isSelecting: false,
  position: DEFAULT_POSITION,
  sharedMessages: [],
  mode: "broadcast",
  debateChannelId: null,
  debateAgentModels: [],

  linkSession: (id) =>
    set((s) => {
      if (s.linkedSessionIds.includes(id)) return s;
      return { linkedSessionIds: [...s.linkedSessionIds, id] };
    }),

  unlinkSession: (id) =>
    set((s) => ({
      linkedSessionIds: s.linkedSessionIds.filter((sid) => sid !== id),
    })),

  setTopic: (t) => set({ topic: t }),

  setExpanded: (v) => set({ isExpanded: v }),

  setSelecting: (v) => set({ isSelecting: v }),

  setPosition: (pos) => set({ position: pos }),

  addSharedMessage: (msg) =>
    set((s) => ({ sharedMessages: [...s.sharedMessages, msg] })),

  setMode: (mode) => set({ mode }),

  setDebateChannelId: (id) => set({ debateChannelId: id }),

  setDebateAgentModel: (agentId, model, label) =>
    set((s) => {
      const filtered = s.debateAgentModels.filter((m) => m.agentId !== agentId);
      if (model === "default") return { debateAgentModels: filtered };
      return { debateAgentModels: [...filtered, { agentId, model, label }] };
    }),

  clearDebateAgentModels: () => set({ debateAgentModels: [] }),

  reset: () =>
    set({
      linkedSessionIds: [],
      topic: "",
      isExpanded: false,
      isSelecting: false,
      sharedMessages: [],
      mode: "broadcast",
      debateChannelId: null,
      debateAgentModels: [],
    }),
}));
