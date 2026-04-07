/**
 * Feature definitions for the Feature Guide.
 * Each feature has metadata for display, discovery, and navigation.
 */

export type FeatureTier = "free" | "pro";
export type FeatureCategory =
  | "session"
  | "intelligence"
  | "collaboration"
  | "devtools"
  | "automation"
  | "security";

export interface FeatureDef {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  category: FeatureCategory;
  tier: FeatureTier;
  /** Panel mode to open, or null if no panel */
  panel?: string;
  /** Settings tab to open, or null */
  settingsTab?: string;
  /** Whether this feature has a toggle in feature settings */
  toggleable?: boolean;
}

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  session: "Session Management",
  intelligence: "AI Intelligence",
  collaboration: "Collaboration",
  devtools: "Developer Tools",
  automation: "Automation",
  security: "Security & Access",
};

export const CATEGORY_ORDER: FeatureCategory[] = [
  "session",
  "intelligence",
  "collaboration",
  "devtools",
  "automation",
  "security",
];

export const FEATURES: FeatureDef[] = [
  // ── Session Management ───────────────────────────────────────────────────
  {
    id: "multi-session",
    name: "Multi-Session",
    description: "Run multiple Claude Code sessions side by side.",
    whenToUse: "Working on multiple tasks or projects simultaneously.",
    category: "session",
    tier: "free",
  },
  {
    id: "templates",
    name: "Session Templates",
    description: "Pre-configured session setups with custom prompts and settings.",
    whenToUse: "Repeating similar tasks — code review, debugging, refactoring.",
    category: "session",
    tier: "free",
  },
  {
    id: "saved-prompts",
    name: "Saved Prompts",
    description: "Reusable prompt snippets you can insert in any session.",
    whenToUse: "Sending the same instructions repeatedly across sessions.",
    category: "session",
    tier: "free",
  },
  {
    id: "thinking-mode",
    name: "Thinking Mode",
    description: "Extended thinking for complex reasoning tasks.",
    whenToUse: "Architecture decisions, debugging tricky bugs, planning.",
    category: "session",
    tier: "free",
  },
  {
    id: "auto-summarize",
    name: "Auto-Summarize",
    description: "Generates a summary when sessions end for future context.",
    whenToUse: "Always on — helps you pick up where you left off.",
    category: "session",
    tier: "free",
    settingsTab: "ai",
  },
  {
    id: "idle-detection",
    name: "Idle Detection",
    description: "Detects and manages idle sessions to save resources.",
    whenToUse: "Running long sessions — auto-pauses when agent is stuck.",
    category: "session",
    tier: "free",
  },

  // ── AI Intelligence ──────────────────────────────────────────────────────
  {
    id: "wiki-kb",
    name: "Wiki Knowledge Base",
    description: "Domain-scoped knowledge that agents load automatically.",
    whenToUse: "Teaching agents about your project's rules, patterns, or domain.",
    category: "intelligence",
    tier: "free",
    panel: "wiki",
    toggleable: true,
  },
  {
    id: "codegraph",
    name: "Code Intelligence",
    description: "Indexes your codebase to give agents structural awareness.",
    whenToUse: "Working on large codebases — agents know file relationships.",
    category: "intelligence",
    tier: "pro",
    panel: "ai-context",
    settingsTab: "ai",
    toggleable: true,
  },
  {
    id: "rtk",
    name: "Token Compression (RTK)",
    description: "Compresses context to fit more information in the window.",
    whenToUse: "Long sessions approaching context limits.",
    category: "intelligence",
    tier: "free",
    settingsTab: "rtk",
    toggleable: true,
  },
  {
    id: "pulse-monitor",
    name: "Pulse Monitor",
    description: "Detects when your agent is struggling or going in circles.",
    whenToUse: "Monitoring session health — warns before wasted tokens.",
    category: "intelligence",
    tier: "free",
    toggleable: true,
  },
  {
    id: "context-estimator",
    name: "Context Estimator",
    description: "Shows token usage breakdown by source in real time.",
    whenToUse: "Understanding what's consuming your context window.",
    category: "intelligence",
    tier: "free",
    panel: "ai-context",
  },

  // ── Collaboration ────────────────────────────────────────────────────────
  {
    id: "telegram",
    name: "Telegram Bot",
    description: "Control and monitor sessions from Telegram.",
    whenToUse: "Managing sessions from your phone or sharing with a team.",
    category: "collaboration",
    tier: "free",
    settingsTab: "telegram",
  },
  {
    id: "debate",
    name: "AI Debate",
    description: "Multiple AI agents argue different perspectives on a topic.",
    whenToUse: "Making decisions — get pro/con analysis, red team reviews.",
    category: "collaboration",
    tier: "free",
  },
  {
    id: "personas",
    name: "Custom Personas",
    description: "Custom AI personalities with different system prompts.",
    whenToUse: "Specializing agents — a reviewer, a planner, a debugger.",
    category: "collaboration",
    tier: "pro",
  },
  {
    id: "mentions",
    name: "@Mention Routing",
    description: "Tag sessions by name to route messages between them.",
    whenToUse: "Cross-session collaboration — one agent calls another.",
    category: "collaboration",
    tier: "pro",
  },

  // ── Developer Tools ──────────────────────────────────────────────────────
  {
    id: "terminal",
    name: "Web Terminal",
    description: "Full terminal emulator in the browser.",
    whenToUse: "Running commands without leaving Companion.",
    category: "devtools",
    tier: "free",
    panel: "terminal",
  },
  {
    id: "file-explorer",
    name: "File Explorer",
    description: "Browse and open project files in the side panel.",
    whenToUse: "Navigating project structure alongside sessions.",
    category: "devtools",
    tier: "free",
    panel: "files",
  },
  {
    id: "browser-preview",
    name: "Browser Preview",
    description: "Live preview of web apps in a side panel.",
    whenToUse: "Developing web UIs — see changes without switching windows.",
    category: "devtools",
    tier: "free",
    panel: "browser",
  },
  {
    id: "inline-diff",
    name: "Inline Diff",
    description: "See file changes as syntax-highlighted diffs in chat.",
    whenToUse: "Reviewing agent's code changes before approving.",
    category: "devtools",
    tier: "free",
  },
  {
    id: "web-intel",
    name: "Web Intel",
    description: "Auto-fetch docs and research from the web for context.",
    whenToUse: "Working with unfamiliar libraries or APIs.",
    category: "devtools",
    tier: "pro",
  },

  // ── Automation ───────────────────────────────────────────────────────────
  {
    id: "mcp-servers",
    name: "MCP Servers",
    description: "Connect external tools (databases, APIs, services) to agents.",
    whenToUse: "Giving agents access to your own tools and services.",
    category: "automation",
    tier: "free",
    settingsTab: "mcp",
  },
  {
    id: "auto-approve",
    name: "Auto-Approve",
    description: "Automatically approve agent tool calls by pattern.",
    whenToUse: "Trusted tasks where you don't want to click approve every time.",
    category: "automation",
    tier: "free",
  },
  {
    id: "workflows",
    name: "Workflows",
    description: "Multi-step automated agent pipelines.",
    whenToUse: "Recurring complex tasks — build, test, deploy sequences.",
    category: "automation",
    tier: "pro",
  },
  {
    id: "schedules",
    name: "Scheduled Tasks",
    description: "Run sessions on a cron schedule.",
    whenToUse: "Automated daily reports, periodic code audits.",
    category: "automation",
    tier: "pro",
  },

  // ── Security & Access ────────────────────────────────────────────────────
  {
    id: "permission-gate",
    name: "Permission Gate",
    description: "Review and approve/deny agent tool calls in real time.",
    whenToUse: "Always on — controls what agents can do on your system.",
    category: "security",
    tier: "free",
  },
  {
    id: "prompt-scanning",
    name: "Prompt Scanning",
    description: "Scans prompts for injection attacks before sending.",
    whenToUse: "Processing untrusted input through agents.",
    category: "security",
    tier: "free",
    settingsTab: "general",
  },
  {
    id: "access-pin",
    name: "Access PIN",
    description: "Require a PIN to access the Companion web interface.",
    whenToUse: "Running Companion on a shared network or server.",
    category: "security",
    tier: "free",
    settingsTab: "general",
  },
];
