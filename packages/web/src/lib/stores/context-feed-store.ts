import { create } from "zustand";
import type { ContextInjectionType } from "@companion/shared";

/** `pulse_guidance` is a client-only injection type pushed by `pulse-warning.tsx`;
 *  it never travels over the WS wire. All other variants come from the server. */
export type ClientInjectionType = ContextInjectionType | "pulse_guidance";

export interface ContextInjectionEvent {
  id: string;
  sessionId: string;
  injectionType: ClientInjectionType;
  summary: string;
  charCount: number;
  tokenEstimate: number;
  timestamp: number;
}

interface ContextFeedStore {
  /** Ring buffer of injection events (max 100) */
  events: ContextInjectionEvent[];
  /** Total injection count this session */
  totalCount: number;
  /** Push a new injection event */
  pushEvent: (event: Omit<ContextInjectionEvent, "id">) => void;
  /** Clear all events */
  clear: () => void;
}

const MAX_EVENTS = 100;

export const useContextFeedStore = create<ContextFeedStore>((set) => ({
  events: [],
  totalCount: 0,

  pushEvent: (event) =>
    set((state) => {
      const newEvent: ContextInjectionEvent = {
        ...event,
        id: `${event.timestamp}-${event.injectionType}-${state.totalCount}`,
      };
      const events = [newEvent, ...state.events].slice(0, MAX_EVENTS);
      return { events, totalCount: state.totalCount + 1 };
    }),

  clear: () => set({ events: [], totalCount: 0 }),
}));
