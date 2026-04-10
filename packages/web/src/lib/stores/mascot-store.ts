/**
 * Mascot store — persists selected mascot to localStorage.
 * Pro tier required to switch from default Ring.
 */

import { create } from "zustand";

export type MascotId = "ring" | string;

export interface MascotOption {
  id: MascotId;
  label: string;
  description: string;
  lottieFile: string | null; // null = default Ring (SVG)
  proOnly: boolean;
}

/** Add new mascots here — drop .lottie into public/mascots/ and add an entry */
export const MASCOT_OPTIONS: MascotOption[] = [
  {
    id: "ring",
    label: "Ring",
    description: "Classic Siri-style glowing orb",
    lottieFile: null,
    proOnly: false,
  },
  {
    id: "chatbot",
    label: "Chatbot",
    description: "Friendly live chat assistant",
    lottieFile: "/mascots/Live chatbot.lottie",
    proOnly: false,
  },
  {
    id: "running-cat",
    label: "Running Cat",
    description: "Energetic feline companion",
    lottieFile: "/mascots/Running Cat.lottie",
    proOnly: false,
  },
  {
    id: "loader-cat",
    label: "Loader Cat",
    description: "Patient waiting kitty",
    lottieFile: "/mascots/Loader cat.lottie",
    proOnly: false,
  },
  {
    id: "totoro",
    label: "Totoro",
    description: "Gentle forest spirit",
    lottieFile: "/mascots/Totoro Walk.lottie",
    proOnly: false,
  },
  {
    id: "paperplane",
    label: "Paper Plane",
    description: "Swift message courier",
    lottieFile: "/mascots/Loading 40 _ Paperplane.lottie",
    proOnly: false,
  },
  {
    id: "no-internet",
    label: "Offline",
    description: "Disconnected dino buddy",
    lottieFile: "/mascots/No Internet.lottie",
    proOnly: false,
  },
  {
    id: "wavey-birdie",
    label: "Wavey Birdie",
    description: "Cheerful waving bird",
    lottieFile: "/mascots/Wavey Birdie.lottie",
    proOnly: false,
  },
  {
    id: "cat-playing",
    label: "Cat Playing",
    description: "Playful bouncy kitty",
    lottieFile: "/mascots/Cat playing animation.lottie",
    proOnly: false,
  },
  {
    id: "ai-flow",
    label: "AI Flow",
    description: "Abstract AI animation",
    lottieFile: "/mascots/ai animation Flow 1.lottie",
    proOnly: false,
  },
];

interface MascotStore {
  selected: MascotId;
  setSelected: (id: MascotId) => void;
}

const getInitialMascot = (): MascotId => {
  if (typeof window === "undefined") return "ring";
  try {
    const stored = localStorage.getItem("companion:mascot");
    if (stored && MASCOT_OPTIONS.some((m) => m.id === stored)) {
      return stored as MascotId;
    }
  } catch {
    // ignore
  }
  return "ring";
};

export const useMascotStore = create<MascotStore>((set) => ({
  selected: getInitialMascot(),

  setSelected: (id) => {
    set({ selected: id });
    try {
      localStorage.setItem("companion:mascot", id);
    } catch {
      // ignore
    }
  },
}));
