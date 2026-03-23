import { create } from "zustand";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PinnedMessagesStore {
  /** Map of sessionId -> array of pinned message indices */
  pins: Record<string, number[]>;
  togglePin: (sessionId: string, messageIndex: number) => void;
  isPinned: (sessionId: string, messageIndex: number) => boolean;
  getPins: (sessionId: string) => number[];
  clearPins: (sessionId: string) => void;
}

// ── Persistence helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "companion_pinned_messages";

function loadFromStorage(): Record<string, number[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    // Validate each entry is an array of numbers
    const result: Record<string, number[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
        result[key] = value as number[];
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveToStorage(pins: Record<string, number[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePinnedMessagesStore = create<PinnedMessagesStore>((set, get) => ({
  pins: loadFromStorage(),

  togglePin: (sessionId, messageIndex) => {
    set((s) => {
      const current = s.pins[sessionId] ?? [];
      const alreadyPinned = current.includes(messageIndex);
      const updated = alreadyPinned
        ? current.filter((idx) => idx !== messageIndex)
        : [...current, messageIndex].sort((a, b) => a - b);

      const nextPins: Record<string, number[]> = {
        ...s.pins,
        [sessionId]: updated,
      };

      saveToStorage(nextPins);
      return { pins: nextPins };
    });
  },

  isPinned: (sessionId, messageIndex) => {
    const pins = get().pins[sessionId] ?? [];
    return pins.includes(messageIndex);
  },

  getPins: (sessionId) => {
    return get().pins[sessionId] ?? [];
  },

  clearPins: (sessionId) => {
    set((s) => {
      const { [sessionId]: _removed, ...rest } = s.pins;
      saveToStorage(rest);
      return { pins: rest };
    });
  },
}));
