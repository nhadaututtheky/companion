import type { IdePack } from "./types.js";

export const CLAUDE_PACK: IdePack = {
  platform: "claude",
  label: "Claude Code",
  emoji: "🟣",
  style: "primary",
  models: [
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { value: "claude-opus-4-7", label: "Opus 4.7" },
    { value: "claude-opus-4-6", label: "Opus 4.6" },
    { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  ],
  approvalModes: [],
  supports: {
    thinking: true,
    compact: true,
    context1M: true,
    resume: true,
    approval: false,
    sandbox: false,
    yolo: false,
  },
  tagline: "Anthropic's SDK-native agent. Supports thinking, compaction, 1M context.",
};
