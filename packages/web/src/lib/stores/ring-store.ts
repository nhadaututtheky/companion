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

interface RingStore {
  linkedSessionIds: string[];
  topic: string;
  isExpanded: boolean;
  isSelecting: boolean;
  position: { x: number; y: number };
  sharedMessages: SharedMessage[];

  linkSession: (id: string) => void;
  unlinkSession: (id: string) => void;
  setTopic: (t: string) => void;
  setExpanded: (v: boolean) => void;
  setSelecting: (v: boolean) => void;
  setPosition: (pos: { x: number; y: number }) => void;
  addSharedMessage: (msg: SharedMessage) => void;
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

  reset: () =>
    set({
      linkedSessionIds: [],
      topic: "",
      isExpanded: false,
      isSelecting: false,
      sharedMessages: [],
    }),
}));
