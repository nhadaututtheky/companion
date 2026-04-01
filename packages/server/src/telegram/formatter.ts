/**
 * Telegram HTML Formatter — Converts Claude Markdown to Telegram-safe HTML.
 * Uses Unicode box-drawing for tables, expandable blockquote for long outputs.
 */

import { TELEGRAM_MAX_LENGTH } from "@companion/shared";

// ─── HTML Escaping ──────────────────────────────────────────────────────────

export function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Markdown → Telegram HTML ───────────────────────────────────────────────

/**
 * Convert Claude's Markdown output to Telegram HTML.
 * Handles code blocks, inline code, bold, italic, links, lists.
 */
export function toTelegramHTML(markdown: string): string {
  if (!markdown) return "";

  // Extract and placeholder code blocks first (to avoid processing their content)
  // Also handle unclosed code fences (Claude sometimes streams incomplete markdown)
  const codeBlocks: string[] = [];
  let result = markdown.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const langAttr = lang ? ` class="language-${escapeHTML(lang)}"` : "";
    codeBlocks.push(`<pre><code${langAttr}>${escapeHTML(code.trimEnd())}</code></pre>`);
    return `\x00CB${idx}\x00`;
  });

  // Handle unclosed code fences — treat remaining ``` as start of unfinished block
  result = result.replace(/```(\w*)\n?([\s\S]*)$/, (_, lang, code) => {
    const idx = codeBlocks.length;
    const langAttr = lang ? ` class="language-${escapeHTML(lang)}"` : "";
    codeBlocks.push(`<pre><code${langAttr}>${escapeHTML(code.trimEnd())}</code></pre>`);
    return `\x00CB${idx}\x00`;
  });

  // Extract inline code
  const inlineCodes: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHTML(code)}</code>`);
    return `\x00IC${idx}\x00`;
  });

  // Escape remaining HTML
  result = escapeHTML(result);

  // Detect and format tables
  result = formatTables(result);

  // Headings: # text → bold (Telegram has no heading tag)
  // Must run before bold conversion to avoid double-wrapping
  result = result.replace(/^#{1,6}\s+(.+)$/gm, (_, t) => `<b>${t}</b>`);

  // Horizontal rules: --- or *** or ___ → unicode separator
  result = result.replace(/^[-*_]{3,}$/gm, "─────────────────");

  // Bold: **text** or __text__
  // Use function replacements to avoid $-interpolation in captured text
  result = result.replace(/\*\*(.+?)\*\*/g, (_, t) => `<b>${t}</b>`);
  result = result.replace(/__(.+?)__/g, (_, t) => `<b>${t}</b>`);

  // Italic: *text* (but not **bold**)
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, t) => `<i>${t}</i>`);
  // Italic: _text_ (only at word boundaries — avoids matching snake_case_vars)
  result = result.replace(/(?<!\w)_(?!_)(.+?)(?<!_)_(?!\w)/g, (_, t) => `<i>${t}</i>`);

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, (_, t) => `<s>${t}</s>`);

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text, url) => `<a href="${url}">${text}</a>`,
  );

  // Restore code blocks and inline code
  result = result.replace(/\x00CB(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)] ?? "");
  result = result.replace(/\x00IC(\d+)\x00/g, (_, idx) => inlineCodes[parseInt(idx)] ?? "");

  return result.trim();
}

// ─── Unicode Box-Drawing Tables ─────────────────────────────────────────────

/**
 * Detect Markdown tables and convert to Unicode box-drawing format.
 * Input: | Col1 | Col2 |\n|---|---|\n| val1 | val2 |
 * Output: ┌──────┬──────┐\n│ Col1 │ Col2 │\n├──────┼──────┤\n│ val1 │ val2 │\n└──────┴──────┘
 */
function formatTables(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Detect table: line with |, followed by separator |---|
    const line = lines[i]!;
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*[-:]+[-|:\s]+\s*\|?\s*$/.test(lines[i + 1]!)
    ) {
      // Collect all table rows
      const tableRows: string[][] = [];
      let j = i;

      while (j < lines.length && lines[j]!.includes("|")) {
        // Skip separator row
        if (/^\s*\|?\s*[-:]+[-|:\s]+\s*\|?\s*$/.test(lines[j]!)) {
          j++;
          continue;
        }

        const cells = lines[j]!.split("|")
          .map((c) => c.trim())
          .filter((c) => c !== "");

        if (cells.length > 0) {
          tableRows.push(cells);
        }
        j++;
      }

      if (tableRows.length > 0) {
        result.push(renderBoxTable(tableRows));
        i = j;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

function renderBoxTable(rows: string[][]): string {
  const numCols = Math.max(...rows.map((r) => r.length));

  // Calculate column widths
  const colWidths: number[] = Array.from({ length: numCols }, () => 3);
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      colWidths[c] = Math.max(colWidths[c] ?? 3, (row[c]?.length ?? 0) + 2);
    }
  }

  const hLine = (left: string, mid: string, right: string, fill: string) =>
    left + colWidths.map((w) => fill.repeat(w)).join(mid) + right;

  const dataLine = (cells: string[]) =>
    "│" +
    colWidths
      .map((w, c) => {
        const cell = cells[c] ?? "";
        return " " + cell + " ".repeat(w - cell.length - 1);
      })
      .join("│") +
    "│";

  const lines: string[] = [];
  lines.push(hLine("┌", "┬", "┐", "─"));

  for (let r = 0; r < rows.length; r++) {
    lines.push(dataLine(rows[r]!));
    if (r === 0 && rows.length > 1) {
      // Header separator
      lines.push(hLine("├", "┼", "┤", "─"));
    }
  }

  lines.push(hLine("└", "┴", "┘", "─"));

  return `<pre>${lines.join("\n")}</pre>`;
}

// ─── Long Output Formatting ─────────────────────────────────────────────────

/**
 * Wrap long content in expandable blockquote (Telegram Bot API 7.3+).
 * Content is collapsed by default, user clicks to expand.
 */
export function wrapExpandable(content: string, maxPreview = 500): string {
  if (content.length <= maxPreview) return content;
  return `<blockquote expandable>${content}</blockquote>`;
}

/**
 * Split a message into chunks that fit Telegram's 4096 char limit.
 * Tries to split at natural boundaries (newlines, sentences).
 */
export function splitMessage(text: string, maxLen = TELEGRAM_MAX_LENGTH - 100): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to split at code block boundary (after </pre>)
    let splitIdx = remaining.lastIndexOf("</pre>", maxLen);
    if (splitIdx > 0 && splitIdx > maxLen * 0.5) {
      splitIdx += 6; // include </pre>
    } else {
      // Try newline
      splitIdx = remaining.lastIndexOf("\n", maxLen);
      if (splitIdx < maxLen * 0.5) {
        // Try sentence
        splitIdx = remaining.lastIndexOf(". ", maxLen);
        if (splitIdx < maxLen * 0.3) {
          // Hard split
          splitIdx = maxLen;
        } else {
          splitIdx += 1;
        }
      }
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx);
  }

  // Repair HTML tag balance in each chunk
  return chunks.map(repairHtmlTags);
}

/**
 * Repair unclosed/orphaned HTML tags in a chunk.
 * Tracks open tags and closes them at end; prepends re-opened tags from previous chunk.
 * For tags with attributes (like <a href="...">), stores the full opening tag for re-insertion.
 */
function repairHtmlTags(chunk: string): string {
  // Match open tags (with optional attributes) and close tags for Telegram-supported elements
  const tagRe =
    /<(b|i|u|s|code|pre|a|blockquote|tg-spoiler|tg-emoji)(?:\s[^>]*)?>|<\/(b|i|u|s|code|pre|a|blockquote|tg-spoiler|tg-emoji)>/gi;
  // Stack stores { tagName, fullOpenTag } so we can re-emit the full opening tag
  const stack: Array<{ tagName: string; fullOpen: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(chunk)) !== null) {
    const openTag = match[1]?.toLowerCase();
    const closeTag = match[2]?.toLowerCase();
    if (openTag) {
      stack.push({ tagName: openTag, fullOpen: match[0] });
    } else if (closeTag) {
      const idx = stack.findLastIndex((s) => s.tagName === closeTag);
      if (idx !== -1) {
        stack.splice(idx, 1);
      } else {
        // Orphaned close tag — just strip it (we don't have the original open tag with attrs)
        chunk = chunk.slice(0, match.index) + chunk.slice(match.index + match[0].length);
        tagRe.lastIndex = match.index; // re-scan from same position
      }
    }
  }

  // Close any remaining open tags (in reverse order)
  for (let i = stack.length - 1; i >= 0; i--) {
    chunk += `</${stack[i]!.tagName}>`;
  }

  return chunk;
}

/**
 * Strip HTML tags for plain-text fallback.
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

export function formatCost(costUsd: number): string {
  return `<code>$${costUsd.toFixed(4)}</code>`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `<code>${(tokens / 1_000_000).toFixed(1)}M</code>`;
  if (tokens >= 1_000) return `<code>${(tokens / 1_000).toFixed(1)}K</code>`;
  return `<code>${tokens}</code>`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

export function formatSessionStatus(opts: {
  model: string;
  status: string;
  numTurns: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  filesModified: string[];
  linesAdded: number;
  linesRemoved: number;
}): string {
  const lines = [
    `<b>Session Status</b>`,
    `Model: <code>${escapeHTML(opts.model)}</code>`,
    `Status: <code>${opts.status}</code>`,
    `Turns: <code>${opts.numTurns}</code>`,
    `Cost: ${formatCost(opts.totalCost)}`,
    `Tokens: ${formatTokens(opts.inputTokens)} in / ${formatTokens(opts.outputTokens)} out`,
  ];

  if (opts.filesModified.length > 0) {
    lines.push(`Files: <code>${opts.filesModified.length}</code> modified`);
    lines.push(`Lines: <code>+${opts.linesAdded} / -${opts.linesRemoved}</code>`);
  }

  return lines.join("\n");
}

// ─── Tool Progress Formatting ────────────────────────────────────────────

const TOOL_EMOJI: Record<string, string> = {
  Bash: "💻",
  Read: "📖",
  Edit: "✏️",
  Write: "📝",
  Glob: "🔍",
  Grep: "🔍",
  Agent: "🤖",
  TodoWrite: "📋",
  TodoRead: "📋",
  WebSearch: "🌐",
  WebFetch: "🌐",
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  if (parts.length <= 3) return path;
  return "…/" + parts.slice(-2).join("/");
}

/**
 * Format a single tool action for the tool feed.
 */
export function formatToolAction(name: string, input: Record<string, unknown>): string {
  const emoji = TOOL_EMOJI[name] ?? "🔧";

  switch (name) {
    case "Bash":
      return `${emoji} Running <code>${escapeHTML(truncate(String(input.command ?? ""), 60))}</code>`;
    case "Read":
      return `${emoji} Reading <code>${escapeHTML(shortenPath(String(input.file_path ?? "")))}</code>`;
    case "Edit":
      return `${emoji} Editing <code>${escapeHTML(shortenPath(String(input.file_path ?? "")))}</code>`;
    case "Write":
      return `${emoji} Writing <code>${escapeHTML(shortenPath(String(input.file_path ?? "")))}</code>`;
    case "Glob":
      return `${emoji} Searching <code>${escapeHTML(String(input.pattern ?? ""))}</code>`;
    case "Grep":
      return `${emoji} Searching for <code>${escapeHTML(truncate(String(input.pattern ?? ""), 40))}</code>`;
    case "Agent":
      return `${emoji} Spawning agent`;
    case "WebSearch":
      return `${emoji} Searching web: <code>${escapeHTML(truncate(String(input.query ?? ""), 50))}</code>`;
    case "WebFetch":
      return `${emoji} Fetching <code>${escapeHTML(truncate(String(input.url ?? ""), 50))}</code>`;
    default:
      return `${emoji} ${escapeHTML(name)}`;
  }
}

/**
 * Format tool_use blocks from an assistant message into a tool feed string.
 */
export function formatToolFeed(
  content: Array<{ type: string; name?: string; input?: unknown }>,
): string | null {
  const actions: string[] = [];
  for (const block of content) {
    if (block.type === "tool_use" && block.name) {
      actions.push(formatToolAction(block.name, (block.input ?? {}) as Record<string, unknown>));
    }
  }
  return actions.length > 0 ? actions.join("\n") : null;
}

// ─── Permission Danger Detection ────────────────────────────────────────────

const DANGEROUS_BASH_PATTERNS = [
  /\brm\b/,
  /\bgit\s+push\b/,
  /\bgit\s+reset\b/,
  /\bdocker\b/,
  /\bkill\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bsudo\b/,
];

const DANGEROUS_FILE_PATTERNS = [/\.env(\b|$)/i, /credentials/i, /secret/i, /password/i, /token/i];

/**
 * Returns true if a Bash command is considered dangerous.
 */
export function isBashDangerous(command: string): boolean {
  return DANGEROUS_BASH_PATTERNS.some((re) => re.test(command));
}

/**
 * Returns true if a file path is considered sensitive/dangerous.
 */
export function isFileDangerous(filePath: string): boolean {
  const basename = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  return DANGEROUS_FILE_PATTERNS.some((re) => re.test(basename));
}

/**
 * Determine if a permission (by tool name + input) is dangerous.
 */
export function isPermissionDangerous(toolName: string, input: Record<string, unknown>): boolean {
  switch (toolName) {
    case "Bash": {
      const cmd = String(input.command ?? "");
      return isBashDangerous(cmd);
    }
    case "Write":
    case "Edit": {
      const fp = String(input.file_path ?? "");
      return isFileDangerous(fp);
    }
    default:
      return false;
  }
}

/**
 * Format a permission request for Telegram display.
 * Shows tool-specific detail (command preview or file path) and flags dangerous ops.
 */
export function formatPermission(
  toolName: string,
  input: Record<string, unknown>,
  description?: string,
): string {
  const dangerous = isPermissionDangerous(toolName, input);
  const prefix = dangerous ? "⚠️" : "🔐";

  // Build detail line based on tool type
  let detail = "";
  switch (toolName) {
    case "Bash": {
      const cmd = truncate(String(input.command ?? ""), 100);
      detail = `<code>${escapeHTML(cmd)}</code>`;
      break;
    }
    case "Write":
    case "Edit":
    case "Read": {
      const fp = String(input.file_path ?? "");
      detail = `<code>${escapeHTML(fp)}</code>`;
      break;
    }
    default:
      if (description) {
        detail = escapeHTML(description);
      }
  }

  const detailSuffix = detail ? `\n${detail}` : description ? `\n${escapeHTML(description)}` : "";
  return `${prefix} <b>${escapeHTML(toolName)}</b>${detailSuffix}`;
}

/**
 * Format file diff for Telegram display.
 */
export function formatEditDiff(filePath: string, linesAdded: number, linesRemoved: number): string {
  return `📝 <code>${escapeHTML(filePath)}</code> <code>+${linesAdded} -${linesRemoved}</code>`;
}
