import type { IdePack } from "./types.js";

export const OPENCODE_PACK: IdePack = {
  platform: "opencode",
  label: "OpenCode",
  emoji: "🟠",
  style: undefined,
  models: [
    { value: "anthropic/claude-sonnet-4-6", label: "Sonnet 4.6" },
    { value: "openai/gpt-4.1", label: "GPT-4.1" },
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "groq/llama-3.3-70b", label: "Llama 3.3 70B (Groq)" },
  ],
  approvalModes: [],
  supports: {
    thinking: true,
    compact: false,
    context1M: false,
    resume: true,
    approval: false,
    sandbox: false,
    yolo: false,
  },
  tagline: "75+ providers via OpenCode. Local (Ollama) and cloud models.",
};
