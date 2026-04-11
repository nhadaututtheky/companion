export interface Tip {
  id: string;
  category: "setup" | "usage" | "discovery";
  title: string;
  body: string;
  /** Only show when this condition key is truthy (checked by tip-banner) */
  showWhen?: string;
  /** Link to open (settings tab, external URL, etc.) */
  action?: { label: string; href?: string; settingsTab?: string };
}

export const TIPS: Tip[] = [
  // ─── Setup tips ──────────────────────────────────────────────────
  {
    id: "setup-rune",
    category: "setup",
    title: "Install Rune Skills",
    body: "Add Rune skills to get auto-planning, code review, and TDD workflows. Install via Claude Code: install-rune-kit.",
    action: { label: "Learn more", href: "https://github.com/cyanheads/rune-kit" },
  },
  {
    id: "setup-neural-memory",
    category: "setup",
    title: "Enable Neural Memory",
    body: "Neural Memory gives agents persistent memory across sessions. Without it, every session starts fresh.",
    action: { label: "Configure MCP", settingsTab: "mcp" },
  },
  {
    id: "setup-claude-md",
    category: "setup",
    title: "Create a CLAUDE.md",
    body: "Add a CLAUDE.md to your project root with conventions and rules. Agents read it at session start for project context.",
  },
  {
    id: "setup-wiki-domain",
    category: "setup",
    title: "Set a Default Wiki Domain",
    body: "Configure a default wiki domain so agents get knowledge base context at session start. Go to Settings > AI & Knowledge.",
    showWhen: "no-wiki-domain",
    action: { label: "Open Settings", settingsTab: "ai" },
  },

  // ─── Usage tips ──────────────────────────────────────────────────
  {
    id: "usage-compact",
    category: "usage",
    title: "Use /compact Before Context Fills",
    body: "When context usage hits 80%, run /compact to compress history. Agents work better with clean context.",
  },
  {
    id: "usage-wiki-notes",
    category: "usage",
    title: "Save Knowledge to Wiki",
    body: "Ask agents to save research findings to wiki. They can write directly via quick notes — no compile step needed.",
  },
  {
    id: "usage-debate",
    category: "usage",
    title: "Use Debate Mode for Better Answers",
    body: "Tag a free model in your message to get a second opinion. Two models debating produces more thorough answers.",
  },
  {
    id: "usage-model-picker",
    category: "usage",
    title: "Pick the Right Model",
    body: "Haiku for quick questions, Sonnet for coding, Opus for architecture. Match model to task complexity to save cost.",
  },
  {
    id: "usage-cost-budget",
    category: "usage",
    title: "Set a Cost Budget",
    body: "Configure a per-session cost budget in Settings to prevent runaway costs. You'll get warnings at 80% and 100%.",
    action: { label: "Set Budget", settingsTab: "general" },
  },

  // ─── Feature discovery ──────────────────────────────────────────
  {
    id: "discover-wiki",
    category: "discovery",
    title: "Wiki Knowledge Base",
    body: "Drop research notes, docs, or raw files into Wiki domains. Agents compile them into structured articles and use them in sessions.",
  },
  {
    id: "discover-codegraph",
    category: "discovery",
    title: "CodeGraph for Code Context",
    body: "Enable CodeGraph to give agents a map of your codebase. They'll know which files and functions exist without scanning everything.",
    action: { label: "Enable", settingsTab: "ai" },
  },
  {
    id: "discover-telegram",
    category: "discovery",
    title: "Control from Telegram",
    body: "Connect a Telegram bot to manage sessions, send messages, and get notifications on the go.",
    action: { label: "Setup Telegram", settingsTab: "telegram" },
  },
  {
    id: "discover-feature-guide",
    category: "discovery",
    title: "Press Ctrl+/ for Feature Guide",
    body: "Hit Ctrl+/ anytime to browse all Companion features with search, descriptions, and quick actions.",
  },
  {
    id: "discover-analytics",
    category: "discovery",
    title: "Track Usage in Analytics",
    body: "Visit the Analytics page to see session stats, costs, model usage, and AI context injection metrics.",
    action: { label: "Open Analytics", href: "/analytics" },
  },
];
