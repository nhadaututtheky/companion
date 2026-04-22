import type { IdePack } from "./types.js";

export const CODEX_PACK: IdePack = {
  platform: "codex",
  label: "Codex",
  emoji: "🟢",
  style: "success",
  models: [
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "o3", label: "o3" },
    { value: "codex-mini-latest", label: "Codex Mini" },
  ],
  approvalModes: [
    { value: "plan", label: "Plan", desc: "Plan only, no execution" },
    { value: "suggest", label: "Suggest", desc: "Review all changes" },
    { value: "auto-edit", label: "Auto-edit", desc: "Auto-approve file edits" },
    { value: "full-auto", label: "Full Auto", desc: "No prompts" },
  ],
  supports: {
    thinking: false,
    compact: false,
    context1M: false,
    resume: false,
    approval: true,
    sandbox: false,
    yolo: false,
  },
  tagline: "OpenAI's Codex CLI. One-shot exec with approval modes.",
};
