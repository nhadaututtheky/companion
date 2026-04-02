/**
 * Command presets — categorized quick-select commands for new session creation.
 */

export interface CommandPreset {
  label: string;
  command: string;
  icon: string; // emoji
}

export interface PresetCategory {
  name: string;
  presets: CommandPreset[];
}

export const COMMAND_PRESETS: PresetCategory[] = [
  {
    name: "Dev Servers",
    presets: [
      { label: "npm run dev", command: "npm run dev", icon: "▶" },
      { label: "bun dev", command: "bun dev", icon: "▶" },
      { label: "vite", command: "vite", icon: "⚡" },
      { label: "next dev", command: "next dev", icon: "▲" },
      { label: "nuxt dev", command: "nuxt dev", icon: "💚" },
    ],
  },
  {
    name: "Build & Test",
    presets: [
      { label: "npm test", command: "npm test", icon: "🧪" },
      { label: "vitest", command: "vitest", icon: "🧪" },
      { label: "jest --watch", command: "jest --watch", icon: "🃏" },
      { label: "playwright test", command: "playwright test", icon: "🎭" },
      { label: "tsc --watch", command: "tsc --watch", icon: "📘" },
      { label: "npm run build", command: "npm run build", icon: "📦" },
    ],
  },
  {
    name: "Docker",
    presets: [
      { label: "docker compose up", command: "docker compose up", icon: "🐳" },
      { label: "docker compose logs", command: "docker compose logs -f", icon: "📋" },
      { label: "docker ps", command: "docker ps", icon: "📊" },
    ],
  },
  {
    name: "Database",
    presets: [
      { label: "prisma studio", command: "prisma studio", icon: "💎" },
      { label: "drizzle-kit studio", command: "drizzle-kit studio", icon: "💧" },
      { label: "redis-cli", command: "redis-cli", icon: "🔴" },
    ],
  },
  {
    name: "Git",
    presets: [
      { label: "git status", command: "git status", icon: "📝" },
      { label: "git log", command: "git log --oneline -20", icon: "📜" },
      { label: "git diff", command: "git diff", icon: "🔍" },
    ],
  },
  {
    name: "AI Agents",
    presets: [
      { label: "Claude Code", command: "claude", icon: "🤖" },
      { label: "Codex", command: "codex", icon: "🧠" },
    ],
  },
];
