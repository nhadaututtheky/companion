/**
 * Context Estimator — estimates initial context token usage breakdown.
 *
 * Scans filesystem to estimate how much context each source consumes
 * when Claude Code starts a session. Sources include CLAUDE.md chain,
 * rules, memory, MCP server instructions, etc.
 *
 * Token estimate: ~4 characters per token (rough average for English + code).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { getMaxContextTokens, type ContextMode } from "@companion/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContextSource {
  /** Human-readable label */
  label: string;
  /** Estimated token count */
  tokens: number;
  /** Number of files/items in this source */
  count: number;
  /** Optional detail list (file names, server names, etc.) */
  details?: string[];
}

export interface ContextBreakdown {
  /** Total estimated tokens across all sources */
  totalTokens: number;
  /** Max context window for the model */
  maxTokens: number;
  /** Percentage of context used */
  percent: number;
  /** Breakdown by source */
  sources: ContextSource[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;
const SYSTEM_PROMPT_TOKENS = 10_000; // Claude Code internal system prompt estimate
const TOOLS_LIST_TOKENS = 2_000; // Built-in tools schema
const GIT_STATUS_TOKENS = 500; // Git status snapshot

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function safeReadFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

/**
 * Scan CLAUDE.md files in the chain:
 * - User global: ~/.claude/CLAUDE.md
 * - Project root: <cwd>/CLAUDE.md
 * - Project .claude: <cwd>/.claude/CLAUDE.md
 */
function scanClaudeMd(cwd: string): ContextSource {
  const home = homedir();
  const files: Array<{ name: string; tokens: number }> = [];

  const candidates = [
    { path: join(home, ".claude", "CLAUDE.md"), name: "~/.claude/CLAUDE.md" },
    { path: join(cwd, "CLAUDE.md"), name: "CLAUDE.md" },
    { path: join(cwd, ".claude", "CLAUDE.md"), name: ".claude/CLAUDE.md" },
  ];

  for (const c of candidates) {
    const content = safeReadFile(c.path);
    if (content) {
      const tokens = estimateTokens(content);
      files.push({ name: c.name, tokens });
    }
  }

  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);

  return {
    label: "CLAUDE.md",
    tokens: totalTokens,
    count: files.length,
    details: files.map((f) => `${f.name} (~${f.tokens.toLocaleString()}t)`),
  };
}

/**
 * Scan rules files:
 * - Global: ~/.claude/rules/*.md
 * - Project: <cwd>/.claude/rules/*.md
 */
function scanRules(cwd: string): ContextSource {
  const home = homedir();
  const files: Array<{ name: string; tokens: number }> = [];

  const dirs = [
    { dir: join(home, ".claude", "rules"), prefix: "~/.claude/rules/" },
    { dir: join(cwd, ".claude", "rules"), prefix: ".claude/rules/" },
  ];

  for (const { dir, prefix } of dirs) {
    for (const name of safeReadDir(dir)) {
      if (!name.endsWith(".md")) continue;
      const content = safeReadFile(join(dir, name));
      if (content) {
        files.push({ name: `${prefix}${name}`, tokens: estimateTokens(content) });
      }
    }
  }

  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);

  return {
    label: "Rules",
    tokens: totalTokens,
    count: files.length,
    details: files.map((f) => `${f.name} (~${f.tokens.toLocaleString()}t)`),
  };
}

/**
 * Scan memory files:
 * - ~/.claude/projects/<project-key>/memory/MEMORY.md (index)
 * - Referenced .md files in the same directory
 */
function scanMemory(cwd: string): ContextSource {
  const home = homedir();
  // Claude Code uses drive letter + path as project key, e.g. "D--Project-Companion"
  const projectKey = resolve(cwd)
    .replace(/[:/\\]/g, "-")
    .replace(/^-+/, "");
  const memDir = join(home, ".claude", "projects", projectKey, "memory");

  const files: Array<{ name: string; tokens: number }> = [];

  // MEMORY.md index is always loaded
  const indexContent = safeReadFile(join(memDir, "MEMORY.md"));
  if (indexContent) {
    files.push({ name: "MEMORY.md", tokens: estimateTokens(indexContent) });
  }

  // Scan referenced memory files
  for (const name of safeReadDir(memDir)) {
    if (name === "MEMORY.md" || !name.endsWith(".md")) continue;
    const content = safeReadFile(join(memDir, name));
    if (content) {
      files.push({ name, tokens: estimateTokens(content) });
    }
  }

  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);

  return {
    label: "Memory",
    tokens: totalTokens,
    count: files.length,
    details:
      files.length <= 5
        ? files.map((f) => `${f.name} (~${f.tokens.toLocaleString()}t)`)
        : [
            ...files.slice(0, 4).map((f) => `${f.name} (~${f.tokens.toLocaleString()}t)`),
            `+${files.length - 4} more files`,
          ],
  };
}

/**
 * Estimate MCP server instructions from session state.
 * Each MCP server typically injects ~500-1500 tokens of instructions.
 */
function estimateMcpServers(mcpServers: Array<{ name: string; status: string }>): ContextSource {
  // Average MCP instruction size varies by server
  const MCP_INSTRUCTION_ESTIMATE: Record<string, number> = {
    "neural-memory": 1500,
    playwright: 800,
    context7: 500,
    firebase: 400,
  };
  const DEFAULT_MCP_TOKENS = 600;

  let totalTokens = 0;
  const details: string[] = [];

  for (const server of mcpServers) {
    const name = server.name.toLowerCase();
    let tokens = DEFAULT_MCP_TOKENS;
    for (const [key, val] of Object.entries(MCP_INSTRUCTION_ESTIMATE)) {
      if (name.includes(key)) {
        tokens = val;
        break;
      }
    }
    totalTokens += tokens;
    details.push(`${server.name} (~${tokens.toLocaleString()}t)`);
  }

  return {
    label: "MCP Servers",
    tokens: totalTokens,
    count: mcpServers.length,
    details,
  };
}

/**
 * Estimate skills list tokens.
 * Scans ~/.claude/skills/ and .rune/skill-*.md
 */
function scanSkills(cwd: string): ContextSource {
  const home = homedir();
  let count = 0;

  // Global skills
  const globalSkillsDir = join(home, ".claude", "skills");
  for (const name of safeReadDir(globalSkillsDir)) {
    if (isFile(join(globalSkillsDir, name, "skill.md"))) count++;
  }

  // Project rune skills
  const runeDir = join(cwd, ".rune");
  for (const name of safeReadDir(runeDir)) {
    if (name.startsWith("skill-") && name.endsWith(".md")) count++;
  }

  // Skills list in system prompt: ~30 tokens per skill name+description
  const tokens = count * 30;

  return {
    label: "Skills",
    tokens,
    count,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function estimateContextBreakdown(
  cwd: string,
  mcpServers: Array<{ name: string; status: string }>,
  model: string,
  contextMode: ContextMode = "200k",
): ContextBreakdown {
  const sources: ContextSource[] = [
    { label: "System Prompt", tokens: SYSTEM_PROMPT_TOKENS, count: 1 },
    scanClaudeMd(cwd),
    scanRules(cwd),
    scanMemory(cwd),
    estimateMcpServers(mcpServers),
    scanSkills(cwd),
    { label: "Tools Schema", tokens: TOOLS_LIST_TOKENS, count: 1 },
    { label: "Git Status", tokens: GIT_STATUS_TOKENS, count: 1 },
  ];

  // Filter out empty sources
  const activeSources = sources.filter((s) => s.tokens > 0);
  const totalTokens = activeSources.reduce((sum, s) => sum + s.tokens, 0);

  const maxTokens = getMaxContextTokens(model, contextMode);
  const percent = Math.min(100, (totalTokens / maxTokens) * 100);

  return {
    totalTokens,
    maxTokens,
    percent,
    sources: activeSources,
  };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

/** Format breakdown as compact text for Telegram */
export function formatBreakdownTelegram(b: ContextBreakdown): string {
  const lines: string[] = [
    `📊 <b>Context loaded:</b> ~${(b.totalTokens / 1000).toFixed(1)}K tokens (${b.percent.toFixed(0)}%)`,
  ];

  for (const s of b.sources) {
    const bar = s.tokens >= 3000 ? "█" : s.tokens >= 1000 ? "▓" : "░";
    const kt = (s.tokens / 1000).toFixed(1);
    lines.push(`${bar} ${s.label}: <b>${kt}K</b>${s.count > 1 ? ` (${s.count})` : ""}`);
  }

  return lines.join("\n");
}

/** Format detailed breakdown (for expand/click) */
export function formatBreakdownDetailed(b: ContextBreakdown): string {
  const lines: string[] = [
    `📊 <b>Context Breakdown</b> — ~${(b.totalTokens / 1000).toFixed(1)}K / ${(b.maxTokens / 1000).toFixed(0)}K tokens (${b.percent.toFixed(1)}%)`,
    "",
  ];

  for (const s of b.sources) {
    const kt = (s.tokens / 1000).toFixed(1);
    const pct = ((s.tokens / b.totalTokens) * 100).toFixed(0);
    lines.push(`<b>${s.label}</b> — ${kt}K tokens (${pct}%)`);
    if (s.details) {
      for (const d of s.details) {
        lines.push(`  └ ${d}`);
      }
    }
  }

  return lines.join("\n");
}
