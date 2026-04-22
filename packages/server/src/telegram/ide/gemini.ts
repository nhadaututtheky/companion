import type { IdePack } from "./types.js";

export const GEMINI_PACK: IdePack = {
  platform: "gemini",
  label: "Gemini",
  emoji: "🔵",
  style: "primary",
  models: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  approvalModes: [],
  supports: {
    thinking: false,
    compact: false,
    context1M: true,
    resume: false,
    approval: false,
    sandbox: true,
    yolo: true,
  },
  tagline: "Google's Gemini CLI. Free tier 1000 req/day, 1M context, sandbox mode.",
};
